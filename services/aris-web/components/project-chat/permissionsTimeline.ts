import type { RenderablePermissionRequest } from '@/lib/happy/permissions';
import type { UiEvent } from '@/lib/happy/types';

const TIMELINE_FALLBACK_BASE = Number.MAX_SAFE_INTEGER / 8;

export type ProjectChatTimelineItem =
  | { type: 'event'; event: UiEvent; sortKey: number; order: number }
  | { type: 'permission'; permission: RenderablePermissionRequest; sortKey: number; order: number };

function timelineSortKey(timestamp: string, order: number): number {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : TIMELINE_FALLBACK_BASE + order;
}

export function isProjectPermissionEvent(event: UiEvent): boolean {
  const streamEvent = typeof event.meta?.streamEvent === 'string' ? event.meta.streamEvent : '';
  return streamEvent === 'permission_request' || streamEvent === 'permission_decision';
}

export function buildProjectChatTimelineItems(
  events: UiEvent[],
  permissions: RenderablePermissionRequest[],
): ProjectChatTimelineItem[] {
  const merged: ProjectChatTimelineItem[] = [];
  let order = 0;

  for (const event of events) {
    if (isProjectPermissionEvent(event)) {
      continue;
    }
    merged.push({
      type: 'event',
      event,
      sortKey: timelineSortKey(event.timestamp, order),
      order,
    });
    order += 1;
  }

  for (const permission of permissions) {
    merged.push({
      type: 'permission',
      permission,
      sortKey: timelineSortKey(permission.requestedAt, order),
      order,
    });
    order += 1;
  }

  return merged.sort((a, b) => {
    if (a.sortKey !== b.sortKey) {
      return a.sortKey - b.sortKey;
    }
    return a.order - b.order;
  });
}
