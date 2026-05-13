import type { WorkspacePagerItem } from './pagerModel';

export function resolveWorkspacePagerSwipeTarget(
  items: readonly WorkspacePagerItem[],
  activePageId: string,
  deltaX: number,
  thresholdPx: number,
): string {
  const currentIndex = items.findIndex((item) => item.id === activePageId);
  if (currentIndex < 0) {
    return activePageId;
  }

  if (deltaX <= -thresholdPx) {
    return items[Math.min(items.length - 1, currentIndex + 1)]?.id ?? activePageId;
  }

  if (deltaX >= thresholdPx) {
    return items[Math.max(0, currentIndex - 1)]?.id ?? activePageId;
  }

  return activePageId;
}
