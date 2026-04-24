import { describe, expect, it } from 'vitest';
import type { WorkspacePagerItem } from '@/app/sessions/[sessionId]/workspace-panels/pagerModel';
import { resolveWorkspacePagerSyncPlan } from '@/app/sessions/[sessionId]/workspace-panels/workspacePagerSyncPlan';

describe('workspace pager sync plan', () => {
  const items: readonly WorkspacePagerItem[] = [
    { id: 'chat', kind: 'chat' as const },
    { id: 'panel-preview-1', kind: 'panel' as const, panelId: 'panel-preview-1' },
    { id: 'create-panel', kind: 'create-panel' as const },
  ];

  it('uses auto alignment before the first visible sync completes', () => {
    expect(resolveWorkspacePagerSyncPlan({
      items,
      activePageId: 'panel-preview-1',
      pagerClientWidth: 720,
      pagerScrollLeft: 0,
      hasCompletedInitialSync: false,
    })).toEqual({
      nextLeft: 720,
      behavior: 'auto',
    });
  });

  it('uses smooth scrolling after the initial sync has settled', () => {
    expect(resolveWorkspacePagerSyncPlan({
      items,
      activePageId: 'create-panel',
      pagerClientWidth: 720,
      pagerScrollLeft: 0,
      hasCompletedInitialSync: true,
    })).toEqual({
      nextLeft: 1440,
      behavior: 'smooth',
    });
  });

  it('skips sync work when the pager is already aligned', () => {
    expect(resolveWorkspacePagerSyncPlan({
      items,
      activePageId: 'panel-preview-1',
      pagerClientWidth: 720,
      pagerScrollLeft: 720,
      hasCompletedInitialSync: true,
    })).toBeNull();
  });

  it('skips sync work when the active page cannot be resolved', () => {
    expect(resolveWorkspacePagerSyncPlan({
      items,
      activePageId: 'missing-page',
      pagerClientWidth: 720,
      pagerScrollLeft: 0,
      hasCompletedInitialSync: false,
    })).toBeNull();
  });
});
