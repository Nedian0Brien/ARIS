import { describe, expect, it } from 'vitest';

import {
  transitionWorkspacePageScrollMemory,
  type WorkspacePageScrollMemory,
} from '@/app/sessions/[sessionId]/workspace-panels/workspacePageScrollMemory';

describe('workspace page scroll memory', () => {
  it('stores the previous page scroll and resets unseen pages to the top', () => {
    const memory: WorkspacePageScrollMemory = {};

    const result = transitionWorkspacePageScrollMemory({
      memory,
      previousPageId: 'chat',
      previousScrollTop: 640,
      nextPageId: 'create-panel',
    });

    expect(result.memory).toEqual({
      chat: 640,
    });
    expect(result.nextScrollTop).toBe(0);
  });

  it('restores the saved scroll position when returning to a page', () => {
    const memory: WorkspacePageScrollMemory = {
      chat: 640,
    };

    const result = transitionWorkspacePageScrollMemory({
      memory,
      previousPageId: 'create-panel',
      previousScrollTop: 128,
      nextPageId: 'chat',
    });

    expect(result.memory).toEqual({
      chat: 640,
      'create-panel': 128,
    });
    expect(result.nextScrollTop).toBe(640);
  });
});
