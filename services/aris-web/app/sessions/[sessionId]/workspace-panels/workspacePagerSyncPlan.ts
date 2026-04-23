import type { WorkspacePagerItem } from './pagerModel';

export type WorkspacePagerSyncPlan = {
  nextLeft: number;
  behavior: ScrollBehavior;
};

type ResolveWorkspacePagerSyncPlanInput = {
  items: readonly WorkspacePagerItem[];
  activePageId: string;
  pagerClientWidth: number;
  pagerScrollLeft: number;
  hasCompletedInitialSync: boolean;
};

export function resolveWorkspacePagerSyncPlan({
  items,
  activePageId,
  pagerClientWidth,
  pagerScrollLeft,
  hasCompletedInitialSync,
}: ResolveWorkspacePagerSyncPlanInput): WorkspacePagerSyncPlan | null {
  if (pagerClientWidth <= 0) {
    return null;
  }

  const nextIndex = items.findIndex((item) => item.id === activePageId);
  if (nextIndex < 0) {
    return null;
  }

  const nextLeft = nextIndex * pagerClientWidth;
  if (Math.abs(pagerScrollLeft - nextLeft) < 2) {
    return null;
  }

  return {
    nextLeft,
    behavior: hasCompletedInitialSync ? 'smooth' : 'auto',
  };
}
