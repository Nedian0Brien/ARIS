import { env } from '@/lib/config';
import { normalizeEvents, normalizeProjectDetail, normalizeProjects } from '@/lib/happy/normalizer';
import { getWorkspaceById, syncWorkspacesForUser } from '@/lib/happy/workspaces';
import type {
  ApprovalPolicy,
  GeminiProjectCapabilities,
  PermissionDecision,
  PermissionRequest,
  ProjectAction,
  ProjectActionResult,
  ProjectDetail,
  ProjectEventsPage,
  ProjectSummary,
  UiEvent,
} from '@/lib/happy/types';

type JsonObject = Record<string, unknown>;
export class HappyHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'HappyHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

let runtimeStatusEndpointSupported: boolean | null = null;

function normalizeWorkspacePath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim();
  if (!normalized) {
    return '/';
  }
  if (normalized === '/') {
    return '/';
  }
  return normalized.replace(/\/+$/, '');
}

function toActivityEpoch(value: string | null | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return Number.NEGATIVE_INFINITY;
  }
  return parsed;
}

function dedupeProjectsByWorkspacePath(projects: ProjectSummary[]): ProjectSummary[] {
  const byPath = new Map<string, ProjectSummary>();
  for (const project of projects) {
    const path = normalizeWorkspacePath(project.projectName);
    const branch = typeof project.branch === 'string' && project.branch.trim()
      ? project.branch.trim()
      : '';
    const dedupeKey = branch ? `${path}#${branch}` : path;
    const existing = byPath.get(dedupeKey);
    if (!existing) {
      byPath.set(dedupeKey, project);
      continue;
    }

    const existingAt = toActivityEpoch(existing.lastActivityAt);
    const candidateAt = toActivityEpoch(project.lastActivityAt);
    if (candidateAt > existingAt || (candidateAt === existingAt && project.id > existing.id)) {
      byPath.set(dedupeKey, project);
    }
  }
  return [...byPath.values()];
}

function asObject(value: unknown): JsonObject | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as JsonObject;
}

function extractArrayPayload(raw: unknown, key: string): unknown[] {
  if (Array.isArray(raw)) {
    return raw;
  }

  const obj = asObject(raw);
  const nested = obj?.[key];
  return Array.isArray(nested) ? nested : [];
}

function findProjectById(list: unknown[], projectId: string): unknown | null {
  for (const item of list) {
    const obj = asObject(item);
    if (!obj) {
      continue;
    }

    if (String(obj.id ?? '') === projectId) {
      return obj;
    }
  }

  return null;
}

type GetProjectEventsOptions = {
  userId?: string;
  before?: string;
  after?: string;
  limit?: number;
  chatId?: string;
  includeUnassigned?: boolean;
};

type ImportedAgentProjectState = {
  hasMoreBefore: boolean;
};

const DEFAULT_EVENTS_PAGE_LIMIT = 40;
const MAX_EVENTS_PAGE_LIMIT = 200;
const HAPPY_MESSAGES_API_LIMIT = 500;
const HAPPY_MESSAGES_BATCH_LIMIT = HAPPY_MESSAGES_API_LIMIT;
const HAPPY_MESSAGES_MAX_PAGES = 1000;
const RECENT_WINDOW_MIN = 240;
const RECENT_WINDOW_MAX = 1400;
const SIDEBAR_RECENT_SCAN_MIN = 500;
const SIDEBAR_RECENT_SCAN_MAX = 2200;

function clampEventsLimit(limit?: number): number {
  const next = Number.isFinite(limit) ? Math.floor(Number(limit)) : DEFAULT_EVENTS_PAGE_LIMIT;
  if (next < 1) {
    return 1;
  }
  if (next > MAX_EVENTS_PAGE_LIMIT) {
    return MAX_EVENTS_PAGE_LIMIT;
  }
  return next;
}

function clampHappyMessagesWindow(limit: number): number {
  return Math.min(HAPPY_MESSAGES_API_LIMIT, Math.max(1, Math.floor(limit)));
}

function sortEventsChronologically(events: UiEvent[]): UiEvent[] {
  return [...events].sort((a, b) => {
    const timeCompare = a.timestamp.localeCompare(b.timestamp);
    if (timeCompare !== 0) {
      return timeCompare;
    }
    return a.id.localeCompare(b.id);
  });
}

function paginateEvents(events: UiEvent[], options: GetProjectEventsOptions): { events: UiEvent[]; page: ProjectEventsPage } {
  const sorted = sortEventsChronologically(events);
  const totalCount = sorted.length;
  const pageLimit = clampEventsLimit(options.limit);

  let startIndex = 0;
  let endIndex = totalCount;

  if (options.after) {
    const afterIndex = sorted.findIndex((event) => event.id === options.after);
    startIndex = afterIndex >= 0 ? afterIndex + 1 : totalCount;
  }
  if (options.before) {
    const beforeIndex = sorted.findIndex((event) => event.id === options.before);
    endIndex = beforeIndex >= 0 ? beforeIndex : totalCount;
  }
  if (startIndex > endIndex) {
    startIndex = endIndex;
  }

  const windowEvents = sorted.slice(startIndex, endIndex);
  let pageEvents = windowEvents;
  let hasMoreBefore = startIndex > 0;
  let hasMoreAfter = endIndex < totalCount;

  if (pageEvents.length > pageLimit) {
    if (options.after) {
      pageEvents = pageEvents.slice(0, pageLimit);
      hasMoreAfter = true;
    } else {
      pageEvents = pageEvents.slice(pageEvents.length - pageLimit);
      hasMoreBefore = true;
    }
  }

  return {
    events: pageEvents,
    page: {
      hasMoreBefore,
      hasMoreAfter,
      oldestEventId: pageEvents[0]?.id ?? null,
      newestEventId: pageEvents[pageEvents.length - 1]?.id ?? null,
      returnedCount: pageEvents.length,
      totalCount,
    },
  };
}

function filterEventsByChat(events: UiEvent[], options: GetProjectEventsOptions): UiEvent[] {
  const chatId = typeof options.chatId === 'string' ? options.chatId.trim() : '';
  if (!chatId) {
    return events;
  }

  const includeUnassigned = options.includeUnassigned === true;
  return events.filter((event) => {
    const eventChatId = typeof event.meta?.chatId === 'string' ? event.meta.chatId.trim() : '';
    if (eventChatId) {
      return eventChatId === chatId;
    }
    return includeUnassigned;
  });
}

function toMessageSeq(value: unknown): number | null {
  const rec = asObject(value);
  if (!rec) {
    return null;
  }

  const meta = asObject(rec.meta);
  const raw = rec.seq ?? meta?.seq;
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

function toProjectSeq(value: unknown): number | null {
  const rec = asObject(value);
  if (!rec) {
    return null;
  }
  const raw = rec.seq;
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

async function fetchHappy(path: string, init?: RequestInit): Promise<unknown> {
  if (!env.RUNTIME_API_TOKEN) {
    throw new Error('RUNTIME_API_TOKEN이 설정되어 있지 않습니다.');
  }

  const response = await fetch(`${env.RUNTIME_API_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.RUNTIME_API_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterMs = (() => {
      if (!retryAfterHeader) {
        return null;
      }
      const headerAsNumber = Number(retryAfterHeader);
      if (Number.isFinite(headerAsNumber) && headerAsNumber > 0) {
        return headerAsNumber * 1000;
      }
      const headerAsDate = Date.parse(retryAfterHeader);
      if (Number.isFinite(headerAsDate)) {
        return Math.max(0, headerAsDate - Date.now());
      }
      return null;
    })();

    const body = (await response.text().catch(() => '')).trim();
    const message = (() => {
      if (!body) {
        return `요청이 실패했습니다. (${response.status} ${response.statusText})`;
      }

      try {
        const parsed = JSON.parse(body) as { error?: string; message?: string; detail?: string };
        const detail = typeof parsed.detail === 'string' ? parsed.detail.trim() : '';
        const message = typeof parsed.message === 'string' ? parsed.message.trim() : '';
        const error = typeof parsed.error === 'string' ? parsed.error.trim() : '';

        if (detail) {
          return detail;
        }
        if (message) {
          return message;
        }
        if (error) {
          return error;
        }
        return body;
      } catch {
        return body;
      }
    })();

    throw new HappyHttpError(response.status, `백엔드 응답 오류 (${response.status}): ${message}`, retryAfterMs);
  }

  return response.json();
}

async function fetchProjectMessagesPage(
  projectId: string,
  options: {
    afterSeq?: number;
    afterId?: string;
    limit: number;
    chatId?: string;
  },
): Promise<{ messages: unknown[]; hasMore: boolean; lastSeq: number }> {
  const params: Record<string, string> = {
    limit: String(clampHappyMessagesWindow(options.limit)),
  };
  if (typeof options.chatId === 'string' && options.chatId.trim().length > 0) {
    params.chatId = options.chatId.trim();
  }
  if (typeof options.afterId === 'string' && options.afterId) {
    params.after_id = options.afterId;
  } else {
    params.after_seq = String(Math.max(0, Math.floor(options.afterSeq ?? 0)));
  }
  const query = new URLSearchParams(params);
  const raw = await fetchHappy(`/v3/projects/${encodeURIComponent(projectId)}/messages?${query.toString()}`);
  const batch = extractArrayPayload(raw, 'messages');
  const response = asObject(raw);
  const maxSeqInBatch = batch.reduce((max: number, item) => {
    const seq = toMessageSeq(item);
    if (seq === null || seq <= max) {
      return max;
    }
    return seq;
  }, 0);
  const responseLastSeqRaw = response?.lastSeq;
  const responseLastSeq = typeof responseLastSeqRaw === 'number'
    ? responseLastSeqRaw
    : Number.parseInt(String(responseLastSeqRaw ?? ''), 10);
  const lastSeq = Number.isFinite(responseLastSeq) && responseLastSeq > 0
    ? responseLastSeq
    : maxSeqInBatch;

  return {
    messages: batch,
    hasMore: response?.hasMore === true,
    lastSeq,
  };
}

async function listAllProjectMessages(projectId: string, chatId?: string): Promise<unknown[]> {
  let afterSeq = 0;
  const allMessages: unknown[] = [];

  for (let page = 0; page < HAPPY_MESSAGES_MAX_PAGES; page += 1) {
    const pageResult = await fetchProjectMessagesPage(projectId, {
      afterSeq,
      limit: HAPPY_MESSAGES_BATCH_LIMIT,
      ...(chatId ? { chatId } : {}),
    });
    const batch = pageResult.messages;
    if (batch.length === 0) {
      break;
    }

    allMessages.push(...batch);
    if (!pageResult.hasMore || pageResult.lastSeq <= afterSeq) {
      break;
    }
    afterSeq = pageResult.lastSeq;
  }

  return allMessages;
}

async function listRecentProjectMessages(
  projectId: string,
  latestSeq: number,
  options: GetProjectEventsOptions,
): Promise<unknown[] | null> {
  const pageLimit = clampEventsLimit(options.limit);
  const chatId = typeof options.chatId === 'string' ? options.chatId.trim() : '';
  if (!chatId) {
    const recentWindow = clampHappyMessagesWindow(
      Math.min(RECENT_WINDOW_MAX, Math.max(RECENT_WINDOW_MIN, pageLimit * 6)),
    );
    const afterSeq = Math.max(0, latestSeq - recentWindow);
    const page = await fetchProjectMessagesPage(projectId, {
      afterSeq,
      limit: recentWindow,
      ...(chatId ? { chatId } : {}),
    });
    if (page.messages.length === 0) {
      return [];
    }
    return page.messages;
  }

  const scanWindow = clampHappyMessagesWindow(
    Math.min(1000, Math.max(HAPPY_MESSAGES_BATCH_LIMIT, pageLimit * 20)),
  );
  const maxScans = 8;
  let cursor = latestSeq;
  let collected: unknown[] = [];
  let matchedCount = 0;

  for (let i = 0; i < maxScans && cursor > 0; i += 1) {
    const afterSeq = Math.max(0, cursor - scanWindow);
    const page = await fetchProjectMessagesPage(projectId, {
      afterSeq,
      limit: scanWindow,
    });
    if (page.messages.length === 0) {
      break;
    }
    collected = [...page.messages, ...collected];
    const messageBatch: unknown[] = Array.isArray(page.messages) ? page.messages : [];
    matchedCount += messageBatch.reduce<number>((sum, message) => {
      const rec = asObject(message);
      const meta = asObject(rec?.meta);
      const eventChatId = typeof meta?.chatId === 'string' ? meta.chatId.trim() : '';
      if (eventChatId) {
        return eventChatId === chatId ? sum + 1 : sum;
      }
      return options.includeUnassigned === true ? sum + 1 : sum;
    }, 0);
    if (matchedCount >= pageLimit || afterSeq === 0) {
      return collected;
    }
    if (page.lastSeq <= afterSeq) {
      break;
    }
    cursor = afterSeq;
  }
  return null;
}

async function listMessagesForAfterCursor(
  projectId: string,
  latestSeq: number,
  options: GetProjectEventsOptions,
): Promise<unknown[] | null> {
  if (!options.after || options.before) {
    return null;
  }
  const pageLimit = clampEventsLimit(options.limit);
  const recentWindow = clampHappyMessagesWindow(
    Math.min(1000, Math.max(RECENT_WINDOW_MIN, pageLimit * 10)),
  );

  // Fast path: use after_id for a single DB-level query when the cursor is a UUID
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.after);
  const chatId = typeof options.chatId === 'string' ? options.chatId.trim() : '';
  if (isUuid && !chatId) {
    const page = await fetchProjectMessagesPage(projectId, {
      afterId: options.after,
      limit: recentWindow,
    });
    return page.messages.length > 0 ? page.messages : [];
  }

  // Fallback: seq-based backward scan (legacy cursors)
  const maxScans = 6;
  let cursor = latestSeq;
  let collected: unknown[] = [];

  for (let i = 0; i < maxScans && cursor > 0; i += 1) {
    const afterSeq = Math.max(0, cursor - recentWindow);
    const page = await fetchProjectMessagesPage(projectId, {
      afterSeq,
      limit: recentWindow,
      ...(chatId ? { chatId } : {}),
    });
    if (page.messages.length === 0) {
      break;
    }
    collected = [...page.messages, ...collected];
    const hasAfterCursor = page.messages.some((message) => {
      const rec = asObject(message);
      return String(rec?.id ?? '') === options.after;
    });
    if (hasAfterCursor || afterSeq === 0) {
      return collected;
    }
    if (page.lastSeq <= afterSeq) {
      break;
    }
    cursor = afterSeq;
  }
  return null;
}

async function listRecentMessagesForSidebar(
  projectId: string,
  latestSeq: number,
  chatCount: number,
): Promise<unknown[] | null> {
  const windowSize = clampHappyMessagesWindow(
    Math.min(
      SIDEBAR_RECENT_SCAN_MAX,
      Math.max(SIDEBAR_RECENT_SCAN_MIN, chatCount * 240),
    ),
  );
  const afterSeq = Math.max(0, latestSeq - windowSize);
  const page = await fetchProjectMessagesPage(projectId, {
    afterSeq,
    limit: windowSize,
  });
  return page.messages;
}

export async function listLatestEventsByChat(input: {
  projectId: string;
  chatIds: string[];
  defaultChatId?: string | null;
}): Promise<Record<string, UiEvent | null>> {
  const normalizedChatIds = [...new Set(input.chatIds.map((chatId) => chatId.trim()).filter(Boolean))];
  const result: Record<string, UiEvent | null> = {};
  for (const chatId of normalizedChatIds) {
    result[chatId] = null;
  }
  if (normalizedChatIds.length === 0) {
    return result;
  }

  const assignLatestEvents = (events: UiEvent[]) => {
    const defaultChatId = typeof input.defaultChatId === 'string' && input.defaultChatId.trim()
      ? input.defaultChatId.trim()
      : '';
    const sorted = sortEventsChronologically(events);
    const requestedSet = new Set(normalizedChatIds);
    for (const event of sorted) {
      const eventChatId = typeof event.meta?.chatId === 'string' ? event.meta.chatId.trim() : '';
      if (eventChatId && requestedSet.has(eventChatId)) {
        result[eventChatId] = event;
        continue;
      }
      if (!eventChatId && defaultChatId && requestedSet.has(defaultChatId)) {
        result[defaultChatId] = event;
      }
    }
  };

  const sessionRaw = await fetchHappy('/v1/projects');
  const projects = extractArrayPayload(sessionRaw, 'projects');
  const found = findProjectById(projects, input.projectId) ?? projects[0] ?? { id: input.projectId };
  const latestSeq = toProjectSeq(found);

  let baseMessages: unknown[];
  if (latestSeq !== null) {
    const recent = await listRecentMessagesForSidebar(input.projectId, latestSeq, normalizedChatIds.length);
    baseMessages = recent ?? [];
  } else {
    baseMessages = await listAllProjectMessages(input.projectId);
  }
  assignLatestEvents(normalizeEvents(baseMessages));

  const missingChatIds = normalizedChatIds.filter((chatId) => !result[chatId]);
  if (missingChatIds.length === 0) {
    return result;
  }

  if (latestSeq === null) {
    return result;
  }

  // If there are many missing chats, it is more efficient to fetch all messages once
  // rather than making multiple sequential paginated API calls per chat.
  if (missingChatIds.length > 3) {
    const allMessages = await listAllProjectMessages(input.projectId);
    assignLatestEvents(normalizeEvents(allMessages));
    return result;
  }

  let requiresFullScan = false;
  await Promise.all(missingChatIds.map(async (chatId) => {
    const recentByChat = await listRecentProjectMessages(input.projectId, latestSeq, {
      limit: 1,
      chatId,
      includeUnassigned: input.defaultChatId === chatId,
    });
    if (!recentByChat) {
      requiresFullScan = true;
      return;
    }
    const filtered = filterEventsByChat(normalizeEvents(recentByChat), {
      chatId,
      includeUnassigned: input.defaultChatId === chatId,
    });
    const sortedFiltered = sortEventsChronologically(filtered);
    const latest = sortedFiltered[sortedFiltered.length - 1] ?? null;
    if (latest) {
      result[chatId] = latest;
    }
  }));

  if (!requiresFullScan) {
    return result;
  }

  const allMessages = await listAllProjectMessages(input.projectId);
  assignLatestEvents(normalizeEvents(allMessages));
  return result;
}

export async function getRuntimeHealth(): Promise<{ api: 'up' | 'down'; happy: 'up' | 'down'; lastSyncAt: string | null }> {
  try {
    const response = await fetch(`${env.RUNTIME_API_URL}/health`, { cache: 'no-store' });
    if (!response.ok) {
      throw new Error(`healthy check failed (${response.status})`);
    }

    return {
      api: 'up',
      happy: 'up',
      lastSyncAt: new Date().toISOString(),
    };
  } catch {
    return { api: 'up', happy: 'down', lastSyncAt: null };
  }
}

export async function listProjects(userId?: string): Promise<ProjectSummary[]> {
  const raw = await fetchHappy('/v1/projects');
  const projects = dedupeProjectsByWorkspacePath(normalizeProjects(extractArrayPayload(raw, 'projects')));

  if (!userId) {
    return projects;
  }

  const workspaceMap = await syncWorkspacesForUser(userId, projects);

  return projects.map((s) => {
    const workspace = workspaceMap.get(s.id);
    return {
      ...s,
      alias: workspace?.alias || null,
      isPinned: workspace?.isPinned ?? false,
      lastReadAt: workspace?.lastReadAt?.toISOString() ?? null,
    };
  });
}

export async function createProject(input: {
  path: string;
  agent?: ProjectSummary['agent'];  // optional — 미전달 시 'claude' 기본값
  approvalPolicy?: ApprovalPolicy;
  branch?: string;
}): Promise<ProjectSummary> {
  const raw = await fetchHappy('/v1/projects', {
    method: 'POST',
    body: JSON.stringify({
      path: input.path,
      flavor: input.agent ?? 'claude',  // 기본값 'claude'
      approvalPolicy: input.approvalPolicy ?? 'on-request',
      ...(input.branch ? { branch: input.branch } : {}),
    }),
  });

  const obj = asObject(raw);
  const project = obj?.project;
  if (!project) {
    throw new Error('백엔드 응답이 올바르지 않습니다.');
  }

  return normalizeProjects([project])[0];
}

export async function getProjectDetail(projectId: string, userId?: string): Promise<ProjectDetail> {
  const raw = await fetchHappy(`/v1/projects/${encodeURIComponent(projectId)}`);
  const obj = asObject(raw);
  const project = obj?.project ?? raw;
  const projectDetail = normalizeProjectDetail(project);

  if (userId) {
    const workspace = await getWorkspaceById(userId, projectId);
    if (workspace) {
      projectDetail.alias = workspace.alias || null;
      projectDetail.isPinned = workspace.isPinned;
      projectDetail.lastReadAt = workspace.lastReadAt?.toISOString() ?? null;
    }
  }

  return projectDetail;
}

export async function updateProjectApprovalPolicy(
  projectId: string,
  approvalPolicy: ApprovalPolicy,
): Promise<ProjectSummary> {
  const raw = await fetchHappy(`/v1/projects/${encodeURIComponent(projectId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ approvalPolicy }),
  });

  const obj = asObject(raw);
  const project = obj?.project;
  if (!project) {
    throw new Error('백엔드 응답이 올바르지 않습니다.');
  }

  return normalizeProjects([project])[0];
}

export async function getProjectEvents(
  projectId: string,
  options: string | GetProjectEventsOptions = {},
): Promise<{ project: ProjectDetail; events: UiEvent[]; page: ProjectEventsPage }> {
  const resolvedOptions: GetProjectEventsOptions = typeof options === 'string'
    ? { userId: options }
    : options;
  const userId = resolvedOptions.userId;

  if (resolvedOptions.before && resolvedOptions.after) {
    throw new Error('before와 after를 동시에 사용할 수 없습니다.');
  }

  const projectRaw = await fetchHappy('/v1/projects');
  const projects = extractArrayPayload(projectRaw, 'projects');
  const found = findProjectById(projects, projectId) ?? projects[0] ?? { id: projectId };
  const latestSeq = toProjectSeq(found);

  let messages: unknown[];
  if (latestSeq !== null && !resolvedOptions.before && !resolvedOptions.after) {
    const recent = await listRecentProjectMessages(projectId, latestSeq, resolvedOptions);
    messages = recent ?? await listAllProjectMessages(projectId, resolvedOptions.chatId);
  } else if (latestSeq !== null && resolvedOptions.after && !resolvedOptions.before) {
    const recentAfter = await listMessagesForAfterCursor(projectId, latestSeq, resolvedOptions);
    messages = recentAfter ?? await listAllProjectMessages(projectId, resolvedOptions.chatId);
  } else {
    messages = await listAllProjectMessages(projectId, resolvedOptions.chatId);
  }

  const projectDetail = normalizeProjectDetail(found);

  if (userId) {
    const workspace = await getWorkspaceById(userId, projectId);
    if (workspace) {
      projectDetail.alias = workspace.alias || null;
      projectDetail.isPinned = workspace.isPinned;
      projectDetail.lastReadAt = workspace.lastReadAt?.toISOString() ?? null;
    }
  }

  return {
    project: projectDetail,
    ...paginateEvents(filterEventsByChat(normalizeEvents(messages), resolvedOptions), resolvedOptions),
  };
}

export async function getImportedAgentProjectState(chatId: string): Promise<ImportedAgentProjectState | null> {
  try {
    const raw = await fetchHappy(`/v1/chats/${encodeURIComponent(chatId)}/import-state`);
    const obj = asObject(raw);
    return obj && typeof obj.hasMoreBefore === 'boolean'
      ? { hasMoreBefore: obj.hasMoreBefore }
      : null;
  } catch (error) {
    if (error instanceof HappyHttpError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function importOlderAgentTranscript(
  chatId: string,
  options: { limitTurns?: number } = {},
): Promise<{ events: unknown[]; hasMoreBefore: boolean }> {
  const raw = await fetchHappy(`/v1/chats/${encodeURIComponent(chatId)}/import/older`, {
    method: 'POST',
    body: JSON.stringify({ limitTurns: options.limitTurns ?? 3 }),
  });
  const obj = asObject(raw);
  return {
    events: extractArrayPayload(raw, 'events'),
    hasMoreBefore: obj?.hasMoreBefore === true,
  };
}

export async function importLatestAgentTranscript(
  chatId: string,
  options: { limitEvents?: number } = {},
): Promise<{ events: unknown[] }> {
  const raw = await fetchHappy(`/v1/chats/${encodeURIComponent(chatId)}/import/latest`, {
    method: 'POST',
    body: JSON.stringify({ limitEvents: options.limitEvents }),
  });
  return {
    events: extractArrayPayload(raw, 'events'),
  };
}

type StreamProjectEventsOptions = {
  after?: string;
  limit?: number;
  chatId?: string;
  includeUnassigned?: boolean;
  latestSeqHint?: number;
};

export async function streamProjectEvents(
  projectId: string,
  options: StreamProjectEventsOptions = {},
): Promise<{ events: UiEvent[]; latestSeq: number }> {
  let latestSeq = typeof options.latestSeqHint === 'number' && options.latestSeqHint > 0
    ? options.latestSeqHint
    : null;

  if (latestSeq === null) {
    const projectRaw = await fetchHappy('/v1/projects');
    const projects = extractArrayPayload(projectRaw, 'projects');
    const found = findProjectById(projects, projectId) ?? projects[0] ?? null;
    latestSeq = toProjectSeq(found) ?? 0;
  }

  let messages: unknown[];
  if (options.after) {
    const recentAfter = await listMessagesForAfterCursor(projectId, latestSeq, options);
    messages = recentAfter ?? await listAllProjectMessages(projectId, options.chatId);
  } else {
    const recent = await listRecentProjectMessages(projectId, latestSeq, options);
    messages = recent ?? await listAllProjectMessages(projectId, options.chatId);
  }

  const filteredOptions: GetProjectEventsOptions = {
    after: options.after,
    limit: options.limit,
    chatId: options.chatId,
    includeUnassigned: options.includeUnassigned,
  };
  const { events } = paginateEvents(filterEventsByChat(normalizeEvents(messages), filteredOptions), filteredOptions);

  const nextSeq = messages.reduce((max: number, msg) => {
    const seq = toMessageSeq(msg);
    return seq !== null && seq > max ? seq : max;
  }, latestSeq);

  return { events, latestSeq: nextSeq };
}

export async function appendProjectMessage(input: {
  projectId: string;
  type: 'message' | 'tool' | 'read' | 'write';
  title?: string;
  text: string;
  meta?: Record<string, unknown>;
}): Promise<UiEvent> {
  const chatId = typeof input.meta?.chatId === 'string' && input.meta.chatId.trim().length > 0
    ? input.meta.chatId.trim()
    : null;
  const raw = chatId
    ? await fetchHappy(`/v1/chats/${encodeURIComponent(chatId)}/events`, {
        method: 'POST',
        body: JSON.stringify({
          projectId: input.projectId,
          type: input.type,
          title: input.title,
          text: input.text,
          meta: input.meta,
        }),
      })
    : await fetchHappy(`/v3/projects/${encodeURIComponent(input.projectId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          type: input.type,
          title: input.title,
          text: input.text,
          meta: input.meta,
        }),
      });

  const obj = asObject(raw);
  const message = obj?.message ?? obj?.event;
  const normalized = normalizeEvents(message ? [message] : []);
  if (normalized[0]) {
    return normalized[0];
  }

  throw new Error('백엔드 응답에서 이벤트를 읽을 수 없습니다.');
}

export async function submitUserPrompt(input: {
  projectId: string;
  runtimeProjectId?: string;
  title?: string;
  text: string;
  meta?: Record<string, unknown>;
}): Promise<UiEvent> {
  const chatId = typeof input.meta?.chatId === 'string' && input.meta.chatId.trim().length > 0
    ? input.meta.chatId.trim()
    : null;
  const raw = chatId
    ? await fetchHappy(`/v1/chats/${encodeURIComponent(chatId)}/user-prompts`, {
        method: 'POST',
        body: JSON.stringify({
          projectId: input.projectId,
          ...(input.runtimeProjectId ? { runtimeProjectId: input.runtimeProjectId } : {}),
          type: 'message',
          title: input.title,
          text: input.text,
          meta: input.meta,
        }),
      })
    : await fetchHappy(`/v1/projects/${encodeURIComponent(input.projectId)}/user-prompts`, {
        method: 'POST',
        body: JSON.stringify({
          type: 'message',
          title: input.title,
          text: input.text,
          meta: input.meta,
        }),
      });

  const obj = asObject(raw);
  const message = obj?.message ?? obj?.event;
  const normalized = normalizeEvents(message ? [message] : []);
  if (normalized[0]) {
    return normalized[0];
  }

  throw new Error('백엔드 응답에서 사용자 프롬프트 이벤트를 읽을 수 없습니다.');
}

export async function runChatTerminalCommand(input: {
  projectId: string;
  runtimeProjectId?: string;
  chatId: string;
  command: string;
}): Promise<UiEvent[]> {
  const raw = await fetchHappy(`/v1/chats/${encodeURIComponent(input.chatId)}/terminal/commands`, {
    method: 'POST',
    body: JSON.stringify({
      projectId: input.projectId,
      ...(input.runtimeProjectId ? { runtimeProjectId: input.runtimeProjectId } : {}),
      command: input.command,
    }),
  });
  const events = normalizeEvents(extractArrayPayload(raw, 'events'));
  if (events.length > 0) {
    return events;
  }

  const obj = asObject(raw);
  const event = obj?.event;
  const normalized = normalizeEvents(event ? [event] : []);
  if (normalized.length > 0) {
    return normalized;
  }

  throw new Error('백엔드 응답에서 터미널 실행 결과를 읽을 수 없습니다.');
}

export async function getProjectRealtimeEvents(input: {
  projectId: string;
  afterCursor?: number;
  limit?: number;
  chatId?: string;
}): Promise<{ events: UiEvent[]; cursor: number }> {
  const query = new URLSearchParams();
  if (Number.isFinite(input.afterCursor)) {
    query.set('after_cursor', String(Math.max(0, Math.floor(Number(input.afterCursor)))));
  }
  if (Number.isFinite(input.limit)) {
    query.set('limit', String(Math.max(1, Math.floor(Number(input.limit)))));
  }
  if (typeof input.chatId === 'string' && input.chatId.trim().length > 0) {
    query.set('chatId', input.chatId.trim());
  }

  const raw = await fetchHappy(
    `/v1/projects/${encodeURIComponent(input.projectId)}/realtime-events${query.toString() ? `?${query.toString()}` : ''}`,
  );
  const obj = asObject(raw);
  const events = normalizeEvents(extractArrayPayload(obj, 'events'));
  const cursor = typeof obj?.cursor === 'number' && Number.isFinite(obj.cursor)
    ? Math.max(0, Math.floor(obj.cursor))
    : 0;
  return { events, cursor };
}

export async function getGeminiProjectCapabilities(projectId: string): Promise<GeminiProjectCapabilities> {
  const raw = await fetchHappy(`/v1/projects/${encodeURIComponent(projectId)}/providers/gemini/capabilities`);
  const obj = asObject(raw);
  const capabilities = asObject(obj?.capabilities);
  if (!capabilities) {
    throw new Error('Gemini capability 응답이 올바르지 않습니다.');
  }

  const modesRecord = asObject(capabilities.modes);
  const modelsRecord = asObject(capabilities.models);
  const normalizeOptions = (value: unknown) => {
    if (!Array.isArray(value)) {
      return [];
    }
    return value.flatMap((item) => {
      const rec = asObject(item);
      const id = typeof rec?.id === 'string' ? rec.id.trim() : '';
      if (!id) {
        return [];
      }
      const label = typeof rec?.label === 'string' && rec.label.trim().length > 0
        ? rec.label.trim()
        : id;
      return [{ id, label }];
    });
  };

  return {
    projectId: typeof capabilities.projectId === 'string' ? capabilities.projectId : projectId,
    fetchedAt: typeof capabilities.fetchedAt === 'string' ? capabilities.fetchedAt : new Date().toISOString(),
    modes: {
      currentModeId: typeof modesRecord?.currentModeId === 'string' ? modesRecord.currentModeId : null,
      availableModes: normalizeOptions(modesRecord?.availableModes),
    },
    models: {
      currentModelId: typeof modelsRecord?.currentModelId === 'string' ? modelsRecord.currentModelId : null,
      availableModels: normalizeOptions(modelsRecord?.availableModels),
    },
  };
}

export async function listPermissionRequests(
  input: string | {
    projectId?: string;
    chatId?: string;
    includeUnassigned?: boolean;
  } = {},
): Promise<PermissionRequest[]> {
  const options = typeof input === 'string' ? { projectId: input } : input;
  const projectId = typeof options.projectId === 'string' && options.projectId.trim().length > 0
    ? options.projectId.trim()
    : undefined;
  const chatId = typeof options.chatId === 'string' && options.chatId.trim().length > 0
    ? options.chatId.trim()
    : undefined;
  const includeUnassigned = options.includeUnassigned === true;
  const params = new URLSearchParams();
  params.set('state', 'pending');
  if (projectId) {
    params.set('projectId', projectId);
  }
  if (chatId) {
    params.set('chatId', chatId);
    if (includeUnassigned) {
      params.set('includeUnassigned', '1');
    }
  }
  const raw = await fetchHappy(`/v1/permissions?${params.toString()}`);
  const list = extractArrayPayload(raw, 'permissions').map((item, idx): PermissionRequest => {
    const rec = asObject(item);
    const rawChatId = typeof rec?.chatId === 'string' ? rec.chatId.trim() : '';
    return {
      id: String(rec?.id ?? `perm-${idx}`),
      projectId: String(rec?.projectId ?? 'unknown'),
      ...(rawChatId ? { chatId: rawChatId } : {}),
      agent: (() => {
        const value = String(rec?.agent ?? 'unknown');
        if (value === 'claude' || value === 'codex' || value === 'gemini') {
          return value;
        }
        return 'unknown';
      })(),
      command: String(rec?.command ?? ''),
      reason: String(rec?.reason ?? 'Runtime requested elevated permission'),
      risk: (() => {
        const value = String(rec?.risk ?? 'medium');
        if (value === 'low' || value === 'medium' || value === 'high') {
          return value;
        }
        return 'medium';
      })(),
      requestedAt: String(rec?.requestedAt ?? new Date().toISOString()),
      state: 'pending',
    };
  });

  return list.filter((item) => {
    if (projectId && item.projectId !== projectId) {
      return false;
    }
    if (!chatId) {
      return true;
    }
    const permissionChatId = typeof item.chatId === 'string' && item.chatId.trim().length > 0
      ? item.chatId.trim()
      : '';
    if (permissionChatId === chatId) {
      return true;
    }
    return includeUnassigned && !permissionChatId;
  });
}

export async function decidePermissionRequest(input: {
  permissionId: string;
  decision: PermissionDecision;
}): Promise<{ id: string; state: 'approved' | 'denied' }> {
  await fetchHappy(`/v1/permissions/${encodeURIComponent(input.permissionId)}/decision`, {
    method: 'POST',
    body: JSON.stringify({ decision: input.decision }),
  });

  return {
    id: input.permissionId,
    state: input.decision === 'deny' ? 'denied' : 'approved',
  };
}

export async function getProjectRuntimeState(
  projectId: string,
  options: { chatId?: string } = {},
): Promise<{ projectId: string; isRunning: boolean }> {
  const chatId = typeof options.chatId === 'string' && options.chatId.trim().length > 0
    ? options.chatId.trim()
    : undefined;
  const deriveFromProjects = async () => {
    const raw = await fetchHappy('/v1/projects');
    const projects = extractArrayPayload(raw, 'projects');
    const found = findProjectById(projects, projectId) ?? { id: projectId };
    const detail = normalizeProjectDetail(found);
    return {
      projectId,
      isRunning: detail.status === 'running',
    };
  };

  if (runtimeStatusEndpointSupported !== false) {
    try {
      const query = chatId ? `?chatId=${encodeURIComponent(chatId)}` : '';
      const raw = await fetchHappy(`/v1/projects/${encodeURIComponent(projectId)}/runtime${query}`);
      const obj = asObject(raw);
      runtimeStatusEndpointSupported = true;
      return {
        projectId: String(obj?.projectId ?? projectId),
        isRunning: Boolean(obj?.isRunning),
      };
    } catch (error) {
      if (error instanceof HappyHttpError && error.status === 404) {
        runtimeStatusEndpointSupported = false;
        if (chatId) {
          // The collection fallback is project-scoped and cannot
          // represent chat-scoped runtime state safely.
          return { projectId, isRunning: false };
        }
          return deriveFromProjects();
      }
      throw error;
    }
  }

  const obj = await deriveFromProjects();
  return {
    projectId: obj.projectId,
    isRunning: obj.isRunning,
  };
}

export async function runProjectAction(
  projectId: string,
  action: ProjectAction,
  options: { chatId?: string } = {},
): Promise<ProjectActionResult> {
  const chatId = typeof options.chatId === 'string' && options.chatId.trim().length > 0
    ? options.chatId.trim()
    : undefined;
  await fetchHappy(`/v1/projects/${encodeURIComponent(projectId)}/actions`, {
    method: 'POST',
    body: JSON.stringify({
      action,
      ...(chatId ? { chatId } : {}),
    }),
  });

  return {
    projectId,
    ...(chatId ? { chatId } : {}),
    action,
    accepted: true,
    message: `${action.toUpperCase()} acknowledged`,
    at: new Date().toISOString(),
  };
}

export async function runProjectWorkspaceDeleteAction(projectId: string): Promise<ProjectActionResult> {
  const raw = await fetchHappy('/v1/projects');
  const projects = normalizeProjects(extractArrayPayload(raw, 'projects'));
  const target = projects.find((project) => project.id === projectId);

  if (!target) {
    return runProjectAction(projectId, 'kill');
  }

  const normalizedPath = normalizeWorkspacePath(target.projectName);
  const relatedProjectIds = Array.from(new Set(
    projects
      .filter((project) => normalizeWorkspacePath(project.projectName) === normalizedPath)
      .map((project) => project.id),
  ));

  const orderedProjectIds = [
    projectId,
    ...relatedProjectIds.filter((id) => id !== projectId),
  ];

  for (const relatedProjectId of orderedProjectIds) {
    await runProjectAction(relatedProjectId, 'kill');
  }

  return {
    projectId,
    action: 'kill',
    accepted: true,
    message: `KILL acknowledged (${orderedProjectIds.length} projects)`,
    at: new Date().toISOString(),
  };
}
