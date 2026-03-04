import { env } from '@/lib/config';
import { normalizeEvents, normalizeSessionDetail, normalizeSessions } from '@/lib/happy/normalizer';
import type {
  PermissionDecision,
  PermissionRequest,
  SessionAction,
  SessionActionResult,
  SessionDetail,
  SessionSummary,
  UiEvent,
} from '@/lib/happy/types';

type JsonObject = Record<string, unknown>;

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
        const parsed = JSON.parse(body) as { error?: string };
        return parsed.error ?? body;
      } catch {
        return body;
      }
    })();

    throw new Error(`백엔드 응답 오류 (${response.status}): ${message}`);
  }

  return response.json();
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

export async function listSessions(): Promise<SessionSummary[]> {
  const raw = await fetchHappy('/v1/sessions');
  return normalizeSessions(extractArrayPayload(raw, 'sessions'));
}

export async function createSession(input: {
  path: string;
  agent: SessionSummary['agent'];
}): Promise<SessionSummary> {
  const raw = await fetchHappy('/v1/sessions', {
    method: 'POST',
    body: JSON.stringify({
      path: input.path,
      flavor: input.agent,
    }),
  });

  const obj = asObject(raw);
  const session = obj?.session;
  if (!session) {
    throw new Error('백엔드 응답이 올바르지 않습니다.');
  }

  return normalizeSessions([session])[0];
}

export async function getSessionEvents(sessionId: string): Promise<{ session: SessionDetail; events: UiEvent[] }> {
  const sessionRaw = await fetchHappy('/v1/sessions');
  const sessions = extractArrayPayload(sessionRaw, 'sessions');
  const found = findSessionById(sessions, sessionId) ?? sessions[0] ?? { id: sessionId };

  const messageRaw = await fetchHappy(`/v3/sessions/${encodeURIComponent(sessionId)}/messages`);
  const messages = extractArrayPayload(messageRaw, 'messages');

  return {
    session: normalizeSessionDetail(found),
    events: normalizeEvents(messages),
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
