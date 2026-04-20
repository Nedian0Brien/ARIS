import {
  CUSTOMIZATION_OVERLAY_MAX_WIDTH_PX,
  MOBILE_LAYOUT_MAX_WIDTH_PX,
  RIGHT_PIN_PREFERS_LEFT_OVERLAY_MIN_WIDTH_PX,
} from '../constants';

export type ChatLayoutStateSnapshot = {
  isChatSidebarOpen: boolean;
  isCustomizationOverlayLayout: boolean;
  isMobileLayout: boolean;
  viewportWidth: number;
};

type ResolveChatLayoutStateInput = {
  viewportWidth: number;
  isCustomizationPinned: boolean;
};

type ResolveInitialChatLayoutStateInput = {
  viewportWidth: number | null;
  isCustomizationPinned: boolean;
};

export function resolveChatLayoutState(input: ResolveChatLayoutStateInput): ChatLayoutStateSnapshot {
  const nextViewportWidth = input.viewportWidth;
  const nextIsMobile = nextViewportWidth <= MOBILE_LAYOUT_MAX_WIDTH_PX;
  const nextUsesCustomizationOverlay = nextIsMobile || (
    nextViewportWidth <= CUSTOMIZATION_OVERLAY_MAX_WIDTH_PX && !input.isCustomizationPinned
  );
  const nextUsesLeftSidebarOverlay = nextIsMobile || (
    (!nextUsesCustomizationOverlay)
    && nextViewportWidth < RIGHT_PIN_PREFERS_LEFT_OVERLAY_MIN_WIDTH_PX
    && (nextViewportWidth > CUSTOMIZATION_OVERLAY_MAX_WIDTH_PX || input.isCustomizationPinned)
  );

  return {
    isChatSidebarOpen: !nextUsesLeftSidebarOverlay,
    isCustomizationOverlayLayout: nextUsesCustomizationOverlay,
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
      isCustomizationOverlayLayout: false,
      isMobileLayout: false,
      isMobileLayoutHydrated: false,
      viewportWidth: 0,
    };
  }

  return {
    ...resolveChatLayoutState({
      viewportWidth: input.viewportWidth,
      isCustomizationPinned: input.isCustomizationPinned,
    }),
    isMobileLayoutHydrated: true,
  };
}
