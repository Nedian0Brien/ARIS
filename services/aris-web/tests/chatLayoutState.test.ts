import { describe, expect, it } from 'vitest';

import {
  resolveChatLayoutState,
  resolveInitialChatLayoutState,
} from '@/app/sessions/[sessionId]/chat-screen/hooks/chatLayoutState';

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

  it('switches mid-width desktop sessions into the customization overlay when the panel is not pinned', () => {
    expect(resolveChatLayoutState({
      viewportWidth: 1200,
      isCustomizationPinned: false,
    })).toEqual({
      isChatSidebarOpen: true,
      isCustomizationOverlayLayout: true,
      isMobileLayout: false,
      viewportWidth: 1200,
    });
  });

  it('keeps the pinned right workspace lane active below 1280px while collapsing the left chat list into overlay mode', () => {
    expect(resolveChatLayoutState({
      viewportWidth: 1200,
      isCustomizationPinned: true,
    })).toEqual({
      isChatSidebarOpen: false,
      isCustomizationOverlayLayout: false,
      isMobileLayout: false,
      viewportWidth: 1200,
    });
  });
});
