import { MOBILE_LAYOUT_MAX_WIDTH_PX } from '../constants';

export type ChatLayoutStateSnapshot = {
  isChatSidebarOpen: boolean;
  isMobileLayout: boolean;
  viewportWidth: number;
};

type ResolveChatLayoutStateInput = {
  viewportWidth: number;
};

type ResolveInitialChatLayoutStateInput = {
  viewportWidth: number | null;
};

export function resolveChatLayoutState(input: ResolveChatLayoutStateInput): ChatLayoutStateSnapshot {
  const nextViewportWidth = input.viewportWidth;
  const nextIsMobile = nextViewportWidth <= MOBILE_LAYOUT_MAX_WIDTH_PX;

  return {
    isChatSidebarOpen: !nextIsMobile,
    isMobileLayout: nextIsMobile,
    viewportWidth: nextViewportWidth,
  };
}

export function resolveInitialChatLayoutState(input: ResolveInitialChatLayoutStateInput): ChatLayoutStateSnapshot & {
  isMobileLayoutHydrated: boolean;
} {
  if (input.viewportWidth === null) {
    return {
      isChatSidebarOpen: true,
      isMobileLayout: false,
      isMobileLayoutHydrated: false,
      viewportWidth: 0,
    };
  }

  return {
    ...resolveChatLayoutState({
      viewportWidth: input.viewportWidth,
    }),
    isMobileLayoutHydrated: true,
  };
}
