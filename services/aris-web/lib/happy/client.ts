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

const mockSessions: SessionSummary[] = [
  {
    id: 'mock-1',
    agent: 'claude',
    status: 'running',
    lastActivityAt: new Date().toISOString(),
    riskScore: 15,
    projectName: '/home/ubuntu/project/web-agentic-coding',
  },
  {
    id: 'mock-2',
    agent: 'codex',
    status: 'error',
    lastActivityAt: new Date(Date.now() - 300_000).toISOString(),
    riskScore: 80,
    projectName: '/srv/legacy',
  },
];

const mockEvents: UiEvent[] = [
  {
    id: 'evt-1',
    timestamp: new Date().toISOString(),
    kind: 'text_reply',
    title: 'Text Reply',
    body: 'Refactor complete. 3 files updated.',
  },
  {
    id: 'evt-2',
    timestamp: new Date().toISOString(),
    kind: 'command_execution',
    title: 'Command Execution',
    body: '$ npm test\nexit code: 0',
  },
  {
    id: 'evt-3',
    timestamp: new Date().toISOString(),
    kind: 'code_read',
    title: 'Code Read',
    body: 'Opened file: src/App.tsx',
  },
  {
    id: 'evt-4',
    timestamp: new Date().toISOString(),
    kind: 'code_write',
    title: 'Code Write',
    body: 'Modified 2 files. Added auth middleware.',
  },
];

const mockPermissionQueue: PermissionRequest[] = [
  {
    id: 'perm-1',
    sessionId: 'mock-1',
    agent: 'claude',
    command: 'npm install sharp',
    reason: 'Native image optimization dependency',
    risk: 'medium',
    requestedAt: new Date(Date.now() - 60_000).toISOString(),
    state: 'pending',
  },
  {
    id: 'perm-2',
    sessionId: 'mock-2',
    agent: 'codex',
    command: 'rm -rf node_modules',
    reason: 'Clean reinstall requested by workflow',
    risk: 'high',
    requestedAt: new Date(Date.now() - 180_000).toISOString(),
    state: 'pending',
  },
];

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
    throw new Error('HAPPY_SERVER_TOKEN is not configured');
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
    throw new Error(`happy request failed: ${response.status}`);
  }

  return response.json();
}

export async function getRuntimeHealth(): Promise<{ api: 'up' | 'down'; happy: 'up' | 'down'; lastSyncAt: string | null }> {
  try {
    await fetchHappy('/v1/sessions');
    return { api: 'up', happy: 'up', lastSyncAt: new Date().toISOString() };
  } catch {
    return { api: 'up', happy: 'down', lastSyncAt: null };
  }
}

export async function listSessions(): Promise<SessionSummary[]> {
  try {
    const raw = await fetchHappy('/v1/sessions');
    return normalizeSessions(extractArrayPayload(raw, 'sessions'));
  } catch {
    return mockSessions;
  }
}

export async function getSessionEvents(sessionId: string): Promise<{ session: SessionDetail; events: UiEvent[] }> {
  try {
    const sessionRaw = await fetchHappy('/v1/sessions');
    const sessions = extractArrayPayload(sessionRaw, 'sessions');
    const found = findSessionById(sessions, sessionId) ?? sessions[0] ?? { id: sessionId };

    const messageRaw = await fetchHappy(`/v3/sessions/${encodeURIComponent(sessionId)}/messages`);
    const messages = extractArrayPayload(messageRaw, 'messages');

    return {
      session: normalizeSessionDetail(found),
      events: normalizeEvents(messages),
    };
  } catch {
    return {
      session: {
        id: sessionId,
        agent: 'unknown',
        status: 'unknown',
        projectName: 'mock-project',
        lastActivityAt: new Date().toISOString(),
      },
      events: mockEvents,
    };
  }
}

export async function appendSessionMessage(input: {
  sessionId: string;
  type: 'message' | 'tool' | 'read' | 'write';
  title?: string;
  text: string;
  meta?: Record<string, unknown>;
}): Promise<UiEvent> {
  try {
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
  } catch {
    // Mock mode below.
  }

  return {
    id: `evt-${Date.now()}`,
    timestamp: new Date().toISOString(),
    kind: classifyMockKind(input.type),
    title: input.title ?? 'User Instruction',
    body: input.text,
    meta: input.meta,
    severity: 'info',
  };
}

function classifyMockKind(type: 'message' | 'tool' | 'read' | 'write'): UiEvent['kind'] {
  if (type === 'tool') {
    return 'command_execution';
  }
  if (type === 'read') {
    return 'code_read';
  }
  if (type === 'write') {
    return 'code_write';
  }
  return 'text_reply';
}

export async function listPermissionRequests(sessionId?: string): Promise<PermissionRequest[]> {
  try {
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
  } catch {
    const pending = mockPermissionQueue.filter((item) => item.state === 'pending');
    return sessionId ? pending.filter((item) => item.sessionId === sessionId) : pending;
  }
}

export async function decidePermissionRequest(input: {
  permissionId: string;
  decision: PermissionDecision;
}): Promise<{ id: string; state: 'approved' | 'denied' }> {
  try {
    await fetchHappy(`/v1/permissions/${encodeURIComponent(input.permissionId)}/decision`, {
      method: 'POST',
      body: JSON.stringify({ decision: input.decision }),
    });
  } catch {
    // Mock mode only returns local response.
  }

  return {
    id: input.permissionId,
    state: input.decision === 'deny' ? 'denied' : 'approved',
  };
}

export async function runSessionAction(sessionId: string, action: SessionAction): Promise<SessionActionResult> {
  try {
    await fetchHappy(`/v1/sessions/${encodeURIComponent(sessionId)}/actions`, {
      method: 'POST',
      body: JSON.stringify({ action }),
    });
  } catch {
    // Mock mode only returns local response.
  }

  return {
    sessionId,
    action,
    accepted: true,
    message: `${action.toUpperCase()} acknowledged`,
    at: new Date().toISOString(),
  };
}
