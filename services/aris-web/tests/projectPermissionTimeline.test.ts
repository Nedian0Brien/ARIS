import { describe, expect, it } from 'vitest';
import type { RenderablePermissionRequest } from '@/lib/happy/permissions';
import type { UiEvent } from '@/lib/happy/types';
import {
  buildProjectChatTimelineItems,
  isProjectPermissionEvent,
} from '@/components/project-chat/permissionsTimeline';

function buildEvent(overrides: Partial<UiEvent> = {}): UiEvent {
  return {
    id: overrides.id ?? 'event-1',
    timestamp: overrides.timestamp ?? '2026-03-15T00:00:00.000Z',
    kind: overrides.kind ?? 'text_reply',
    title: overrides.title ?? 'Reply',
    body: overrides.body ?? 'Done',
    ...(overrides.meta ? { meta: overrides.meta } : {}),
  };
}

function buildPermission(overrides: Partial<RenderablePermissionRequest> = {}): RenderablePermissionRequest {
  return {
    id: overrides.id ?? 'perm-1',
    sessionId: overrides.sessionId ?? 'session-1',
    chatId: overrides.chatId ?? 'chat-1',
    agent: overrides.agent ?? 'codex',
    command: overrides.command ?? 'npm test',
    reason: overrides.reason ?? 'Needs command approval',
    risk: overrides.risk ?? 'medium',
    requestedAt: overrides.requestedAt ?? '2026-03-15T00:00:01.000Z',
    state: overrides.state ?? 'pending',
    availability: overrides.availability ?? 'live',
  };
}

describe('project permission timeline', () => {
  it('filters raw permission stream events and inserts renderable permission cards', () => {
    const userEvent = buildEvent({
      id: 'user-1',
      timestamp: '2026-03-15T00:00:00.000Z',
      meta: { role: 'user' },
    });
    const rawPermissionEvent = buildEvent({
      id: 'raw-permission',
      timestamp: '2026-03-15T00:00:01.000Z',
      meta: {
        streamEvent: 'permission_request',
        permissionId: 'perm-1',
      },
    });
    const agentEvent = buildEvent({
      id: 'agent-1',
      timestamp: '2026-03-15T00:00:02.000Z',
    });

    expect(isProjectPermissionEvent(rawPermissionEvent)).toBe(true);
    expect(buildProjectChatTimelineItems(
      [userEvent, rawPermissionEvent, agentEvent],
      [buildPermission()],
    ).map((item) => item.type === 'event' ? item.event.id : item.permission.id)).toEqual([
      'user-1',
      'perm-1',
      'agent-1',
    ]);
  });
});
