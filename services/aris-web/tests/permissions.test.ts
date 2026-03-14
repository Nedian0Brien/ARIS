import { describe, expect, it } from 'vitest';
import type { PermissionRequest, UiEvent } from '@/lib/happy/types';
import {
  hydratePersistedPermissions,
  isPermissionForChat,
  mergeRenderablePermissions,
  normalizePermissionChatId,
} from '@/lib/happy/permissions';

function buildEvent(overrides: Partial<UiEvent> = {}): UiEvent {
  return {
    id: overrides.id ?? 'event-1',
    timestamp: overrides.timestamp ?? '2026-03-15T00:00:00.000Z',
    kind: overrides.kind ?? 'text_reply',
    title: overrides.title ?? 'Permission Request',
    body: overrides.body ?? 'Run pwd',
    ...(overrides.meta ? { meta: overrides.meta } : {}),
  };
}

function buildPermission(overrides: Partial<PermissionRequest> = {}): PermissionRequest {
  return {
    id: overrides.id ?? 'perm-1',
    sessionId: overrides.sessionId ?? 'session-1',
    ...(overrides.chatId ? { chatId: overrides.chatId } : {}),
    agent: overrides.agent ?? 'gemini',
    command: overrides.command ?? 'Run pwd',
    reason: overrides.reason ?? 'Need shell access',
    risk: overrides.risk ?? 'medium',
    requestedAt: overrides.requestedAt ?? '2026-03-15T00:00:00.000Z',
    state: overrides.state ?? 'pending',
  };
}

describe('permission helpers', () => {
  it('hydrates persisted permission request and decision events into the latest state', () => {
    const requestEvent = buildEvent({
      id: 'perm-request',
      meta: {
        streamEvent: 'permission_request',
        permissionId: 'perm-1',
        sessionId: 'session-1',
        permissionState: 'pending',
        command: 'Run pwd',
        reason: 'Need shell access',
        risk: 'medium',
        chatId: 'chat-1',
        agent: 'gemini',
        requestedAt: '2026-03-15T00:00:00.000Z',
      },
    });
    const decisionEvent = buildEvent({
      id: 'perm-decision',
      timestamp: '2026-03-15T00:00:05.000Z',
      meta: {
        streamEvent: 'permission_decision',
        permissionId: 'perm-1',
        sessionId: 'session-1',
        permissionState: 'approved',
        command: 'Run pwd',
        reason: 'Need shell access',
        risk: 'medium',
        chatId: 'chat-1',
        agent: 'gemini',
        requestedAt: '2026-03-15T00:00:00.000Z',
      },
    });

    expect(hydratePersistedPermissions([requestEvent, decisionEvent])).toEqual([
      buildPermission({
        id: 'perm-1',
        chatId: 'chat-1',
        state: 'approved',
      }),
    ]);
  });

  it('prefers live permission entries over persisted copies when merging render state', () => {
    const persisted = buildPermission({ id: 'perm-1', state: 'pending' });
    const live = buildPermission({ id: 'perm-1', state: 'approved' });

    expect(mergeRenderablePermissions([live], [persisted])).toEqual([
      {
        ...live,
        availability: 'live',
      },
    ]);
  });

  it('matches unassigned permissions when includeUnassigned is enabled', () => {
    const permission = buildPermission();
    expect(normalizePermissionChatId(permission)).toBeNull();
    expect(isPermissionForChat(permission, 'chat-1', true)).toBe(true);
    expect(isPermissionForChat(permission, 'chat-1', false)).toBe(false);
  });
});
