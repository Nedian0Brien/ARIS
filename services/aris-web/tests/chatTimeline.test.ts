import { describe, expect, it } from 'vitest';
import type { RenderablePermissionRequest } from '@/lib/happy/permissions';
import { buildPermissionTimelineItems } from '@/app/sessions/[sessionId]/chatTimeline';

function buildPermission(overrides: Partial<RenderablePermissionRequest> = {}): RenderablePermissionRequest {
  return {
    id: overrides.id ?? 'perm-1',
    sessionId: overrides.sessionId ?? 'session-1',
    ...(overrides.chatId ? { chatId: overrides.chatId } : {}),
    agent: overrides.agent ?? 'gemini',
    command: overrides.command ?? 'Run pwd',
    reason: overrides.reason ?? 'Need shell access',
    risk: overrides.risk ?? 'medium',
    requestedAt: overrides.requestedAt ?? '2026-03-15T00:00:00.000Z',
    state: overrides.state ?? 'approved',
    availability: overrides.availability ?? 'persisted',
  };
}

describe('buildPermissionTimelineItems', () => {
  it('keeps approved permissions in the timeline without reclassifying them as pending', () => {
    const items = buildPermissionTimelineItems([
      buildPermission({ state: 'approved' }),
    ]);

    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      type: 'permission',
      permission: {
        id: 'perm-1',
        state: 'approved',
        availability: 'persisted',
      },
    });
  });
});
