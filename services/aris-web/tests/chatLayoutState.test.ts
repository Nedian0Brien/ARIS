import { describe, expect, it } from 'vitest';

import {
  resolveChatLayoutState,
  resolveInitialChatLayoutState,
} from '@/app/sessions/[sessionId]/chat-screen/hooks/chatLayoutState';

describe('chatLayoutState', () => {
  it('keeps the server fallback desktop-shaped until a browser width is available', () => {
    expect(resolveInitialChatLayoutState({
      viewportWidth: null,
    })).toEqual({
      isChatSidebarOpen: true,
      isMobileLayout: false,
      isMobileLayoutHydrated: false,
      viewportWidth: 0,
    });
  });

  it('hydrates directly into the mobile layout when a narrow viewport is already known', () => {
    expect(resolveInitialChatLayoutState({
      viewportWidth: 390,
    })).toEqual({
      isChatSidebarOpen: false,
      isMobileLayout: true,
      isMobileLayoutHydrated: true,
      viewportWidth: 390,
    });
  });

  it('keeps desktop sidebars open when the initial viewport is wide enough', () => {
    expect(resolveInitialChatLayoutState({
      viewportWidth: 1400,
    })).toEqual({
      isChatSidebarOpen: true,
      isMobileLayout: false,
      isMobileLayoutHydrated: true,
      viewportWidth: 1400,
    });
  });

  it('keeps tablet and desktop widths on the in-row sidebar layout', () => {
    expect(resolveChatLayoutState({
      viewportWidth: 1200,
    })).toEqual({
      isChatSidebarOpen: true,
      isMobileLayout: false,
      viewportWidth: 1200,
    });
  });

  it('still collapses the chat sidebar into overlay mode on mobile widths', () => {
    expect(resolveChatLayoutState({
      viewportWidth: 960,
    })).toEqual({
      isChatSidebarOpen: false,
      isMobileLayout: true,
      viewportWidth: 960,
    });
  });
});
