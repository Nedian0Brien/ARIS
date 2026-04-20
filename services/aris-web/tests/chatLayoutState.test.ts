import { describe, expect, it } from 'vitest';

import { resolveInitialChatLayoutState } from '@/app/sessions/[sessionId]/chat-screen/hooks/chatLayoutState';

describe('chatLayoutState', () => {
  it('keeps the server fallback desktop-shaped until a browser width is available', () => {
    expect(resolveInitialChatLayoutState({
      viewportWidth: null,
      isCustomizationPinned: false,
    })).toEqual({
      isChatSidebarOpen: true,
      isCustomizationOverlayLayout: false,
      isMobileLayout: false,
      isMobileLayoutHydrated: false,
      viewportWidth: 0,
    });
  });

  it('hydrates directly into the mobile layout when a narrow viewport is already known', () => {
    expect(resolveInitialChatLayoutState({
      viewportWidth: 390,
      isCustomizationPinned: false,
    })).toEqual({
      isChatSidebarOpen: false,
      isCustomizationOverlayLayout: true,
      isMobileLayout: true,
      isMobileLayoutHydrated: true,
      viewportWidth: 390,
    });
  });

  it('keeps desktop sidebars open when the initial viewport is wide enough', () => {
    expect(resolveInitialChatLayoutState({
      viewportWidth: 1400,
      isCustomizationPinned: false,
    })).toEqual({
      isChatSidebarOpen: true,
      isCustomizationOverlayLayout: false,
      isMobileLayout: false,
      isMobileLayoutHydrated: true,
      viewportWidth: 1400,
    });
  });
});
