import type { RenderablePermissionRequest } from '@/lib/happy/permissions';

const TIMELINE_FALLBACK_BASE = Number.MAX_SAFE_INTEGER / 8;

export type PermissionTimelineItem = {
  type: 'permission';
  permission: RenderablePermissionRequest;
  sortKey: number;
  order: number;
};

export function buildPermissionTimelineItems(permissions: RenderablePermissionRequest[]): PermissionTimelineItem[] {
  return permissions.map((permission, order) => {
    const parsed = Date.parse(permission.requestedAt);
    return {
      type: 'permission',
      permission,
      sortKey: Number.isFinite(parsed) ? parsed : TIMELINE_FALLBACK_BASE + order,
      order,
    };
  });
}
