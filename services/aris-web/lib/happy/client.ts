import { env } from '@/lib/config';
import { prisma } from '@/lib/db/prisma';
import { normalizeEvents, normalizeSessionDetail, normalizeSessions } from '@/lib/happy/normalizer';
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

  constructor(status: number, message: string) {
    super(message);
    this.name = 'HappyHttpError';
    this.status = status;
  }
}

let runtimeStatusEndpointSupported: boolean | null = null;

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

  const raw = rec.seq;
  const parsed = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return parsed;
}

async function fetchHappy(path: string, init?: RequestInit): Promise<unknown> {
  if (!env.HAPPY_SERVER_TOKEN) {
    throw new Error('HAPPY_SERVER_TOKEN이 설정되어 있지 않습니다.');
  }

  const response = await fetch(`${env.HAPPY_SERVER_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${env.HAPPY_SERVER_TOKEN}`,
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    cache: 'no-store',
  });

  if (!response.ok) {
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

    throw new HappyHttpError(response.status, `백엔드 응답 오류 (${response.status}): ${message}`);
  }

  return response.json();
}

async function listAllSessionMessages(sessionId: string): Promise<unknown[]> {
  let afterSeq = 0;
  const allMessages: unknown[] = [];

  for (let page = 0; page < HAPPY_MESSAGES_MAX_PAGES; page += 1) {
    const query = new URLSearchParams({
      after_seq: String(afterSeq),
      limit: String(HAPPY_MESSAGES_BATCH_LIMIT),
    });
    const raw = await fetchHappy(`/v3/sessions/${encodeURIComponent(sessionId)}/messages?${query.toString()}`);
    const batch = extractArrayPayload(raw, 'messages');
    if (batch.length === 0) {
      break;
    }

    allMessages.push(...batch);

    const maxSeq = batch.reduce((max: number, item) => {
      const seq = toMessageSeq(item);
      if (seq === null || seq <= max) {
        return max;
      }
      return seq;
    }, afterSeq);

    const response = asObject(raw);
    const hasMore = response?.hasMore === true;
    if (!hasMore || maxSeq <= afterSeq) {
      break;
    }
    afterSeq = maxSeq;
  }

  return allMessages;
}

export async function getRuntimeHealth(): Promise<{ api: 'up' | 'down'; happy: 'up' | 'down'; lastSyncAt: string | null }> {
  try {
    const response = await fetch(`${env.HAPPY_SERVER_URL}/health`, { cache: 'no-store' });
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
  const sessions = normalizeSessions(extractArrayPayload(raw, 'sessions'));

  if (!userId) {
    return sessions;
  }

  const metadatas = await prisma.sessionMetadata.findMany({
    where: {
      sessionId: { in: sessions.map((s) => s.id) },
      userId,
    },
  });

  const metadataMap = new Map(metadatas.map((m) => [m.sessionId, m]));

  return sessions.map((s) => {
    const meta = metadataMap.get(s.id);
    return {
      ...s,
      alias: meta?.alias || null,
      isPinned: meta?.isPinned ?? false,
      lastReadAt: meta?.lastReadAt?.toISOString() ?? null,
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

  const messages = await listAllSessionMessages(sessionId);

  const sessionDetail = normalizeSessionDetail(found);

  if (userId) {
    const meta = await prisma.sessionMetadata.findUnique({
      where: { sessionId_userId: { sessionId, userId } },
    });

    if (meta) {
      sessionDetail.alias = meta.alias || null;
      sessionDetail.isPinned = meta.isPinned;
      sessionDetail.lastReadAt = meta.lastReadAt?.toISOString() ?? null;
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

export async function listPermissionRequests(sessionId?: string): Promise<PermissionRequest[]> {
  const raw = await fetchHappy('/v1/permissions?state=pending');
  const list = extractArrayPayload(raw, 'permissions').map((item, idx): PermissionRequest => {
    const rec = asObject(item);
    return {
      id: String(rec?.id ?? `perm-${idx}`),
      sessionId: String(rec?.sessionId ?? 'unknown'),
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

  return sessionId ? list.filter((item) => item.sessionId === sessionId) : list;
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

export async function getSessionRuntimeState(sessionId: string): Promise<{ sessionId: string; isRunning: boolean }> {
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
      const raw = await fetchHappy(`/v1/sessions/${encodeURIComponent(sessionId)}/runtime`);
      const obj = asObject(raw);
      runtimeStatusEndpointSupported = true;
      return {
        sessionId: String(obj?.sessionId ?? sessionId),
        isRunning: Boolean(obj?.isRunning),
      };
    } catch (error) {
      if (error instanceof HappyHttpError && error.status === 404) {
        runtimeStatusEndpointSupported = false;
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

export async function runSessionAction(sessionId: string, action: SessionAction): Promise<SessionActionResult> {
  await fetchHappy(`/v1/sessions/${encodeURIComponent(sessionId)}/actions`, {
    method: 'POST',
    body: JSON.stringify({ action }),
  });

  return {
    sessionId,
    action,
    accepted: true,
    message: `${action.toUpperCase()} acknowledged`,
    at: new Date().toISOString(),
  };
}
