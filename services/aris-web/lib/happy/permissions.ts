import type { PermissionRequest, UiEvent } from '@/lib/happy/types';

export type RenderablePermissionRequest = PermissionRequest & {
  availability: 'live' | 'persisted';
};

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizePermissionState(value: unknown): PermissionRequest['state'] | null {
  return value === 'pending' || value === 'approved' || value === 'denied' ? value : null;
}

function normalizePermissionRisk(value: unknown): PermissionRequest['risk'] {
  return value === 'low' || value === 'medium' || value === 'high' ? value : 'medium';
}

function normalizePermissionAgent(value: unknown): PermissionRequest['agent'] {
  return value === 'claude' || value === 'codex' || value === 'gemini' ? value : 'unknown';
}

export function normalizePermissionChatId(permission: PermissionRequest): string | null {
  const raw = normalizeText(permission.chatId);
  return raw.length > 0 ? raw : null;
}

export function isPermissionForChat(
  permission: PermissionRequest,
  activeChatId: string | null,
  includeUnassignedForActiveChat: boolean,
): boolean {
  const permissionChatId = normalizePermissionChatId(permission);
  const normalizedActiveChatId = normalizeText(activeChatId) || null;

  if (permissionChatId && normalizedActiveChatId) {
    return permissionChatId === normalizedActiveChatId;
  }
  if (!permissionChatId) {
    return includeUnassignedForActiveChat || !normalizedActiveChatId;
  }
  return false;
}

function buildPermissionFromEvent(event: UiEvent, fallback?: PermissionRequest): PermissionRequest | null {
  const meta = event.meta ?? {};
  const permissionId = normalizeText(meta.permissionId);
  if (!permissionId) {
    return null;
  }

  const state = normalizePermissionState(meta.permissionState)
    ?? (meta.streamEvent === 'permission_request' ? 'pending' : null);
  if (!state) {
    return null;
  }

  const command = normalizeText(meta.command) || fallback?.command || normalizeText(event.body);
  const reason = normalizeText(meta.reason) || fallback?.reason || 'Runtime requested elevated permission';
  const requestedAt = normalizeText(meta.requestedAt) || fallback?.requestedAt || event.timestamp;
  const chatId = normalizeText(meta.chatId) || normalizePermissionChatId(fallback ?? {
    id: '',
    sessionId: '',
    agent: 'unknown',
    command: '',
    reason: '',
    risk: 'medium',
    requestedAt,
    state,
  });

  return {
    id: permissionId,
    sessionId: normalizeText(meta.sessionId) || fallback?.sessionId || '',
    ...(chatId ? { chatId } : {}),
    agent: normalizePermissionAgent(meta.agent ?? fallback?.agent),
    command,
    reason,
    risk: normalizePermissionRisk(meta.risk ?? fallback?.risk),
    requestedAt,
    state,
  };
}

export function hydratePersistedPermissions(events: UiEvent[]): PermissionRequest[] {
  const hydrated = new Map<string, PermissionRequest>();

  for (const event of events) {
    const streamEvent = normalizeText(event.meta?.streamEvent);
    if (streamEvent !== 'permission_request' && streamEvent !== 'permission_decision') {
      continue;
    }
    const current = hydrated.get(normalizeText(event.meta?.permissionId));
    const next = buildPermissionFromEvent(event, current);
    if (!next) {
      continue;
    }
    hydrated.set(next.id, next);
  }

  return [...hydrated.values()].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

export function mergeRenderablePermissions(
  livePermissions: PermissionRequest[],
  persistedPermissions: PermissionRequest[],
): RenderablePermissionRequest[] {
  const merged = new Map<string, RenderablePermissionRequest>();

  for (const permission of persistedPermissions) {
    merged.set(permission.id, {
      ...permission,
      availability: 'persisted',
    });
  }

  for (const permission of livePermissions) {
    merged.set(permission.id, {
      ...permission,
      availability: 'live',
    });
  }

  return [...merged.values()].sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}
