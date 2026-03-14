import { env } from '@/lib/config';
import { normalizeEvents, normalizeSessionDetail, normalizeSessions } from '@/lib/happy/normalizer';
import { getWorkspaceById, syncWorkspacesForUser } from '@/lib/happy/workspaces';
import type {
  ApprovalPolicy,
  PermissionDecision,
  PermissionRequest,
  SessionAction,
  SessionActionResult,
  SessionDetail,
  SessionEventsPage,
  SessionSummary,
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

function dedupeSessionsByWorkspacePath(sessions: SessionSummary[]): SessionSummary[] {
  const byPath = new Map<string, SessionSummary>();
  for (const session of sessions) {
    const path = normalizeWorkspacePath(session.projectName);
    const existing = byPath.get(path);
    if (!existing) {
      byPath.set(path, session);
      continue;
    }

    const existingAt = toActivityEpoch(existing.lastActivityAt);
    const candidateAt = toActivityEpoch(session.lastActivityAt);
    if (candidateAt > existingAt || (candidateAt === existingAt && session.id > existing.id)) {
      byPath.set(path, session);
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

function findSessionById(list: unknown[], sessionId: string): unknown | null {
  for (const item of list) {
    const obj = asObject(item);
    if (!obj) {
      continue;
    }

    if (String(obj.id ?? '') === sessionId) {
      return obj;
    }
  }

  return null;
}

type GetSessionEventsOptions = {
  userId?: string;
  before?: string;
  after?: string;
  limit?: number;
  chatId?: string;
  includeUnassigned?: boolean;
};

const DEFAULT_EVENTS_PAGE_LIMIT = 40;
const MAX_EVENTS_PAGE_LIMIT = 200;
const HAPPY_MESSAGES_BATCH_LIMIT = 500;
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

function sortEventsChronologically(events: UiEvent[]): UiEvent[] {
  return [...events].sort((a, b) => {
    const timeCompare = a.timestamp.localeCompare(b.timestamp);
    if (timeCompare !== 0) {
      return timeCompare;
    }
    return a.id.localeCompare(b.id);
  });
}

function paginateEvents(events: UiEvent[], options: GetSessionEventsOptions): { events: UiEvent[]; page: SessionEventsPage } {
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

function filterEventsByChat(events: UiEvent[], options: GetSessionEventsOptions): UiEvent[] {
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

function toSessionSeq(value: unknown): number | null {
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

async function fetchSessionMessagesPage(
  sessionId: string,
  options: {
    afterSeq: number;
    limit: number;
  },
): Promise<{ messages: unknown[]; hasMore: boolean; lastSeq: number }> {
  const query = new URLSearchParams({
    after_seq: String(Math.max(0, Math.floor(options.afterSeq))),
    limit: String(Math.max(1, Math.floor(options.limit))),
  });
  const raw = await fetchHappy(`/v3/sessions/${encodeURIComponent(sessionId)}/messages?${query.toString()}`);
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

async function listAllSessionMessages(sessionId: string): Promise<unknown[]> {
  let afterSeq = 0;
  const allMessages: unknown[] = [];

  for (let page = 0; page < HAPPY_MESSAGES_MAX_PAGES; page += 1) {
    const pageResult = await fetchSessionMessagesPage(sessionId, {
      afterSeq,
      limit: HAPPY_MESSAGES_BATCH_LIMIT,
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

async function listRecentSessionMessages(
  sessionId: string,
  latestSeq: number,
  options: GetSessionEventsOptions,
): Promise<unknown[] | null> {
  const pageLimit = clampEventsLimit(options.limit);
  const chatId = typeof options.chatId === 'string' ? options.chatId.trim() : '';
  if (!chatId) {
    const recentWindow = Math.min(RECENT_WINDOW_MAX, Math.max(RECENT_WINDOW_MIN, pageLimit * 6));
    const afterSeq = Math.max(0, latestSeq - recentWindow);
    const page = await fetchSessionMessagesPage(sessionId, {
      afterSeq,
      limit: recentWindow,
    });
    if (page.messages.length === 0) {
      return [];
    }
    return page.messages;
  }

  const scanWindow = Math.min(1000, Math.max(HAPPY_MESSAGES_BATCH_LIMIT, pageLimit * 20));
  const maxScans = 8;
  let cursor = latestSeq;
  let collected: unknown[] = [];
  let matchedCount = 0;

  for (let i = 0; i < maxScans && cursor > 0; i += 1) {
    const afterSeq = Math.max(0, cursor - scanWindow);
    const page = await fetchSessionMessagesPage(sessionId, {
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
  sessionId: string,
  latestSeq: number,
  options: GetSessionEventsOptions,
): Promise<unknown[] | null> {
  if (!options.after || options.before) {
    return null;
  }
  const pageLimit = clampEventsLimit(options.limit);
  const recentWindow = Math.min(1000, Math.max(RECENT_WINDOW_MIN, pageLimit * 10));
  const maxScans = 6;
  let cursor = latestSeq;
  let collected: unknown[] = [];

  for (let i = 0; i < maxScans && cursor > 0; i += 1) {
    const afterSeq = Math.max(0, cursor - recentWindow);
    const page = await fetchSessionMessagesPage(sessionId, {
      afterSeq,
      limit: recentWindow,
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
  sessionId: string,
  latestSeq: number,
  chatCount: number,
): Promise<unknown[] | null> {
  const windowSize = Math.min(
    SIDEBAR_RECENT_SCAN_MAX,
    Math.max(SIDEBAR_RECENT_SCAN_MIN, chatCount * 240),
  );
  const afterSeq = Math.max(0, latestSeq - windowSize);
  const page = await fetchSessionMessagesPage(sessionId, {
    afterSeq,
    limit: windowSize,
  });
  return page.messages;
}

export async function listLatestEventsByChat(input: {
  sessionId: string;
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

  const sessionRaw = await fetchHappy('/v1/sessions');
  const sessions = extractArrayPayload(sessionRaw, 'sessions');
  const found = findSessionById(sessions, input.sessionId) ?? sessions[0] ?? { id: input.sessionId };
  const latestSeq = toSessionSeq(found);

  let baseMessages: unknown[];
  if (latestSeq !== null) {
    const recent = await listRecentMessagesForSidebar(input.sessionId, latestSeq, normalizedChatIds.length);
    baseMessages = recent ?? [];
  } else {
    baseMessages = await listAllSessionMessages(input.sessionId);
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
    const allMessages = await listAllSessionMessages(input.sessionId);
    assignLatestEvents(normalizeEvents(allMessages));
    return result;
  }

  let requiresFullScan = false;
  await Promise.all(missingChatIds.map(async (chatId) => {
    const recentByChat = await listRecentSessionMessages(input.sessionId, latestSeq, {
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

  const allMessages = await listAllSessionMessages(input.sessionId);
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

export async function listSessions(userId?: string): Promise<SessionSummary[]> {
  const raw = await fetchHappy('/v1/sessions');
  const sessions = dedupeSessionsByWorkspacePath(normalizeSessions(extractArrayPayload(raw, 'sessions')));

  if (!userId) {
    return sessions;
  }

  const workspaceMap = await syncWorkspacesForUser(userId, sessions);

  return sessions.map((s) => {
    const workspace = workspaceMap.get(s.id);
    return {
      ...s,
      alias: workspace?.alias || null,
      isPinned: workspace?.isPinned ?? false,
      lastReadAt: workspace?.lastReadAt?.toISOString() ?? null,
    };
  });
}

export async function createSession(input: {
  path: string;
  agent: SessionSummary['agent'];
  approvalPolicy?: ApprovalPolicy;
}): Promise<SessionSummary> {
  const raw = await fetchHappy('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      path: input.path,
      flavor: input.agent,
      approvalPolicy: input.approvalPolicy ?? 'on-request',
    }),
  });

  const obj = asObject(raw);
  const session = obj?.session;
  if (!session) {
    throw new Error('백엔드 응답이 올바르지 않습니다.');
  }

  return normalizeSessions([session])[0];
}

export async function getSessionEvents(
  sessionId: string,
  options: string | GetSessionEventsOptions = {},
): Promise<{ session: SessionDetail; events: UiEvent[]; page: SessionEventsPage }> {
  const resolvedOptions: GetSessionEventsOptions = typeof options === 'string'
    ? { userId: options }
    : options;
  const userId = resolvedOptions.userId;

  if (resolvedOptions.before && resolvedOptions.after) {
    throw new Error('before와 after를 동시에 사용할 수 없습니다.');
  }

  const sessionRaw = await fetchHappy('/v1/sessions');
  const sessions = extractArrayPayload(sessionRaw, 'sessions');
  const found = findSessionById(sessions, sessionId) ?? sessions[0] ?? { id: sessionId };
  const latestSeq = toSessionSeq(found);

  let messages: unknown[];
  if (latestSeq !== null && !resolvedOptions.before && !resolvedOptions.after) {
    const recent = await listRecentSessionMessages(sessionId, latestSeq, resolvedOptions);
    messages = recent ?? await listAllSessionMessages(sessionId);
  } else if (latestSeq !== null && resolvedOptions.after && !resolvedOptions.before) {
    const recentAfter = await listMessagesForAfterCursor(sessionId, latestSeq, resolvedOptions);
    messages = recentAfter ?? await listAllSessionMessages(sessionId);
  } else {
    messages = await listAllSessionMessages(sessionId);
  }

  const sessionDetail = normalizeSessionDetail(found);

  if (userId) {
    const workspace = await getWorkspaceById(userId, sessionId);
    if (workspace) {
      sessionDetail.alias = workspace.alias || null;
      sessionDetail.isPinned = workspace.isPinned;
      sessionDetail.lastReadAt = workspace.lastReadAt?.toISOString() ?? null;
    }
  }

  return {
    session: sessionDetail,
    ...paginateEvents(filterEventsByChat(normalizeEvents(messages), resolvedOptions), resolvedOptions),
  };
}

export async function appendSessionMessage(input: {
  sessionId: string;
  type: 'message' | 'tool' | 'read' | 'write';
  title?: string;
  text: string;
  meta?: Record<string, unknown>;
}): Promise<UiEvent> {
  const raw = await fetchHappy(`/v3/sessions/${encodeURIComponent(input.sessionId)}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      type: input.type,
      title: input.title,
      text: input.text,
      meta: input.meta,
    }),
  });

  const obj = asObject(raw);
  const message = obj?.message;
  const normalized = normalizeEvents(message ? [message] : []);
  if (normalized[0]) {
    return normalized[0];
  }

  throw new Error('백엔드 응답에서 이벤트를 읽을 수 없습니다.');
}

export async function getSessionRealtimeEvents(input: {
  sessionId: string;
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
    `/v1/sessions/${encodeURIComponent(input.sessionId)}/realtime-events${query.toString() ? `?${query.toString()}` : ''}`,
  );
  const obj = asObject(raw);
  const events = normalizeEvents(extractArrayPayload(obj, 'events'));
  const cursor = typeof obj?.cursor === 'number' && Number.isFinite(obj.cursor)
    ? Math.max(0, Math.floor(obj.cursor))
    : 0;
  return { events, cursor };
}

export async function listPermissionRequests(
  input: string | {
    sessionId?: string;
    chatId?: string;
    includeUnassigned?: boolean;
  } = {},
): Promise<PermissionRequest[]> {
  const options = typeof input === 'string' ? { sessionId: input } : input;
  const sessionId = typeof options.sessionId === 'string' && options.sessionId.trim().length > 0
    ? options.sessionId.trim()
    : undefined;
  const chatId = typeof options.chatId === 'string' && options.chatId.trim().length > 0
    ? options.chatId.trim()
    : undefined;
  const includeUnassigned = options.includeUnassigned === true;
  const params = new URLSearchParams();
  params.set('state', 'pending');
  if (sessionId) {
    params.set('sessionId', sessionId);
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
      sessionId: String(rec?.sessionId ?? 'unknown'),
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
    if (sessionId && item.sessionId !== sessionId) {
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

export async function getSessionRuntimeState(
  sessionId: string,
  options: { chatId?: string } = {},
): Promise<{ sessionId: string; isRunning: boolean }> {
  const chatId = typeof options.chatId === 'string' && options.chatId.trim().length > 0
    ? options.chatId.trim()
    : undefined;
  const deriveFromSessions = async () => {
    const raw = await fetchHappy('/v1/sessions');
    const sessions = extractArrayPayload(raw, 'sessions');
    const found = findSessionById(sessions, sessionId) ?? { id: sessionId };
    const detail = normalizeSessionDetail(found);
    return {
      sessionId,
      isRunning: detail.status === 'running',
    };
  };

  if (runtimeStatusEndpointSupported !== false) {
    try {
      const query = chatId ? `?chatId=${encodeURIComponent(chatId)}` : '';
      const raw = await fetchHappy(`/v1/sessions/${encodeURIComponent(sessionId)}/runtime${query}`);
      const obj = asObject(raw);
      runtimeStatusEndpointSupported = true;
      return {
        sessionId: String(obj?.sessionId ?? sessionId),
        isRunning: Boolean(obj?.isRunning),
      };
    } catch (error) {
      if (error instanceof HappyHttpError && error.status === 404) {
        runtimeStatusEndpointSupported = false;
        if (chatId) {
          // Legacy fallback (`/v1/sessions`) is session-scoped and cannot
          // represent chat-scoped runtime state safely.
          return { sessionId, isRunning: false };
        }
        return deriveFromSessions();
      }
      throw error;
    }
  }

  const obj = await deriveFromSessions();
  return {
    sessionId: obj.sessionId,
    isRunning: obj.isRunning,
  };
}

export async function runSessionAction(
  sessionId: string,
  action: SessionAction,
  options: { chatId?: string } = {},
): Promise<SessionActionResult> {
  const chatId = typeof options.chatId === 'string' && options.chatId.trim().length > 0
    ? options.chatId.trim()
    : undefined;
  await fetchHappy(`/v1/sessions/${encodeURIComponent(sessionId)}/actions`, {
    method: 'POST',
    body: JSON.stringify({
      action,
      ...(chatId ? { chatId } : {}),
    }),
  });

  return {
    sessionId,
    ...(chatId ? { chatId } : {}),
    action,
    accepted: true,
    message: `${action.toUpperCase()} acknowledged`,
    at: new Date().toISOString(),
  };
}
