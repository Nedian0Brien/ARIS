import { useEffect, useState, type RefObject } from 'react';
import {
  CUSTOMIZATION_OVERLAY_MAX_WIDTH_PX,
  MOBILE_LAYOUT_MAX_WIDTH_PX,
  RIGHT_PIN_PREFERS_LEFT_OVERLAY_MIN_WIDTH_PX,
} from '../constants';

type UseChatLayoutStateParams = {
  centerHeaderRef: RefObject<HTMLElement | null>;
};

export function useChatLayoutState({
  centerHeaderRef,
}: UseChatLayoutStateParams) {
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [isMobileLayoutHydrated, setIsMobileLayoutHydrated] = useState(false);
  const [expandedResultIds, setExpandedResultIds] = useState<Record<string, boolean>>({});
  const [expandedActionRunIds, setExpandedActionRunIds] = useState<Record<string, boolean>>({});
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [chatIdCopyState, setChatIdCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [idBundleCopyState, setIdBundleCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [showPermissionQueue, setShowPermissionQueue] = useState(true);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true);
  const [viewportWidth, setViewportWidth] = useState(0);
  const [isCustomizationOverlayLayout, setIsCustomizationOverlayLayout] = useState(false);
  const [isCustomizationSidebarOpen, setIsCustomizationSidebarOpen] = useState(false);
  const [isCustomizationPinned, setIsCustomizationPinned] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [centerHeaderWidth, setCenterHeaderWidth] = useState(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    const header = centerHeaderRef.current;
    if (!header || typeof ResizeObserver === 'undefined') {
      return;
    }

    const updateWidth = () => {
      setCenterHeaderWidth(header.getBoundingClientRect().width);
    };

    updateWidth();
    const observer = new ResizeObserver(() => {
      updateWidth();
    });
    observer.observe(header);

    return () => {
      observer.disconnect();
    };
  }, [centerHeaderRef]);

  useEffect(() => {
    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_LAYOUT_MAX_WIDTH_PX}px)`);
    const customizationOverlayQuery = window.matchMedia(`(max-width: ${CUSTOMIZATION_OVERLAY_MAX_WIDTH_PX}px)`);

    const syncLayout = () => {
      const nextIsMobile = mobileQuery.matches;
      const nextViewportWidth = window.innerWidth;
      const nextUsesCustomizationOverlay = nextIsMobile || (customizationOverlayQuery.matches && !isCustomizationPinned);
      const nextUsesLeftSidebarOverlay = nextIsMobile || (
        (!nextUsesCustomizationOverlay)
        && nextViewportWidth < RIGHT_PIN_PREFERS_LEFT_OVERLAY_MIN_WIDTH_PX
        && (nextViewportWidth > CUSTOMIZATION_OVERLAY_MAX_WIDTH_PX || isCustomizationPinned)
      );

      setViewportWidth(nextViewportWidth);
      setIsMobileLayout(nextIsMobile);
      setIsCustomizationOverlayLayout(nextUsesCustomizationOverlay);
      setIsChatSidebarOpen(!nextUsesLeftSidebarOverlay);
      if (!nextUsesCustomizationOverlay) {
        setIsCustomizationSidebarOpen(false);
      }
    };

    syncLayout();
    setIsMobileLayoutHydrated(true);
    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', syncLayout);
      customizationOverlayQuery.addEventListener('change', syncLayout);
    } else {
      mobileQuery.addListener(syncLayout);
      customizationOverlayQuery.addListener(syncLayout);
    }

    return () => {
      if (typeof mobileQuery.removeEventListener === 'function') {
        mobileQuery.removeEventListener('change', syncLayout);
        customizationOverlayQuery.removeEventListener('change', syncLayout);
      } else {
        mobileQuery.removeListener(syncLayout);
        customizationOverlayQuery.removeListener(syncLayout);
      }
    };
  }, [isCustomizationPinned]);

  useEffect(() => {
    if (!highlightedEventId) {
      return;
    }
    const timer = window.setTimeout(() => {
      setHighlightedEventId((current) => (current === highlightedEventId ? null : current));
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [highlightedEventId]);

  useEffect(() => {
    if (!isContextMenuOpen) {
      setChatIdCopyState('idle');
      setIdBundleCopyState('idle');
    }
  }, [isContextMenuOpen]);

  const toggleDebugMode = () => {
    setIsDebugMode((prev) => !prev);
  };

  const handleToggleCustomizationPinned = () => {
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setIsCustomizationPinned((prev) => !prev);
  };

  return {
    centerHeaderWidth,
    chatIdCopyState,
    expandedActionRunIds,
    expandedResultIds,
    handleToggleCustomizationPinned,
    highlightedEventId,
    idBundleCopyState,
    isChatSidebarOpen,
    isContextMenuOpen,
    isCustomizationOverlayLayout,
    isCustomizationPinned,
    isCustomizationSidebarOpen,
    isDebugMode,
    isMobileLayout,
    isMobileLayoutHydrated,
    isMounted,
    setChatIdCopyState,
    setExpandedActionRunIds,
    setExpandedResultIds,
    setHighlightedEventId,
    setIdBundleCopyState,
    setIsChatSidebarOpen,
    setIsContextMenuOpen,
    setIsCustomizationSidebarOpen,
    setShowPermissionQueue,
    setViewportWidth,
    showPermissionQueue,
    toggleDebugMode,
    viewportWidth,
  };
}
