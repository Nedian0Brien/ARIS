import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { VIEWPORT_LAYOUT_CHANGE_EVENT } from '@/components/layout/ViewportHeightSync';
import { recordScrollDebugEvent } from '../../scrollDebug';
import { MOBILE_LAYOUT_MAX_WIDTH_PX } from '../constants';
import { resolveChatLayoutState, resolveInitialChatLayoutState } from './chatLayoutState';

const VIEWPORT_LAYOUT_READY_IDLE_MS = 160;

type UseChatLayoutStateParams = {
  centerHeaderRef: RefObject<HTMLElement | null>;
};

export function useChatLayoutState({
  centerHeaderRef,
}: UseChatLayoutStateParams) {
  const initialLayoutState = resolveInitialChatLayoutState({
    viewportWidth: typeof window === 'undefined' ? null : window.innerWidth,
    isCustomizationPinned: false,
  });
  const [isMobileLayout, setIsMobileLayout] = useState(initialLayoutState.isMobileLayout);
  const [isMobileLayoutHydrated, setIsMobileLayoutHydrated] = useState(initialLayoutState.isMobileLayoutHydrated);
  const [isViewportLayoutReady, setIsViewportLayoutReady] = useState(false);
  const [expandedResultIds, setExpandedResultIds] = useState<Record<string, boolean>>({});
  const [expandedActionRunIds, setExpandedActionRunIds] = useState<Record<string, boolean>>({});
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [chatIdCopyState, setChatIdCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [idBundleCopyState, setIdBundleCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [showPermissionQueue, setShowPermissionQueue] = useState(true);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(initialLayoutState.isChatSidebarOpen);
  const [viewportWidth, setViewportWidth] = useState(initialLayoutState.viewportWidth);
  const [isCustomizationOverlayLayout, setIsCustomizationOverlayLayout] = useState(initialLayoutState.isCustomizationOverlayLayout);
  const [isCustomizationSidebarOpen, setIsCustomizationSidebarOpen] = useState(false);
  const [isCustomizationPinned, setIsCustomizationPinned] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [isDebugMode, setIsDebugMode] = useState(false);
  const [centerHeaderWidth, setCenterHeaderWidth] = useState(0);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    let readyTimeoutId = 0;

    const scheduleViewportLayoutReady = () => {
      window.clearTimeout(readyTimeoutId);
      setIsViewportLayoutReady(false);
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'layout:scheduleViewportLayoutReady',
        detail: {
          phase: 'pending',
        },
      });
      readyTimeoutId = window.setTimeout(() => {
        const hasViewportMeasurement = document.documentElement.style.getPropertyValue('--app-vh').trim().length > 0;
        setIsViewportLayoutReady(hasViewportMeasurement);
        recordScrollDebugEvent({
          kind: 'trigger',
          source: 'layout:viewportLayoutReady:resolved',
          detail: {
            hasViewportMeasurement,
          },
        });
      }, VIEWPORT_LAYOUT_READY_IDLE_MS);
    };

    scheduleViewportLayoutReady();
    window.addEventListener(VIEWPORT_LAYOUT_CHANGE_EVENT, scheduleViewportLayoutReady);

    return () => {
      window.clearTimeout(readyTimeoutId);
      window.removeEventListener(VIEWPORT_LAYOUT_CHANGE_EVENT, scheduleViewportLayoutReady);
    };
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

  useLayoutEffect(() => {
    const mobileQuery = window.matchMedia(`(max-width: ${MOBILE_LAYOUT_MAX_WIDTH_PX}px)`);

    const syncLayout = () => {
      const nextLayoutState = resolveChatLayoutState({
        viewportWidth: window.innerWidth,
        isCustomizationPinned,
      });

      setViewportWidth(nextLayoutState.viewportWidth);
      setIsMobileLayout(nextLayoutState.isMobileLayout);
      setIsCustomizationOverlayLayout(nextLayoutState.isCustomizationOverlayLayout);
      setIsChatSidebarOpen(nextLayoutState.isChatSidebarOpen);
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'layout:syncLayout',
        detail: {
          nextIsMobile: nextLayoutState.isMobileLayout,
          nextViewportWidth: nextLayoutState.viewportWidth,
          nextUsesCustomizationOverlay: nextLayoutState.isCustomizationOverlayLayout,
          nextUsesLeftSidebarOverlay: !nextLayoutState.isChatSidebarOpen,
          mediaQueryMatches: mobileQuery.matches,
          isCustomizationPinned,
        },
      });
      if (!nextLayoutState.isCustomizationOverlayLayout) {
        setIsCustomizationSidebarOpen(false);
      }
    };

    syncLayout();
    setIsMobileLayoutHydrated(true);
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'layout:isMobileLayoutHydrated',
      detail: {
        hydrated: true,
      },
    });
    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', syncLayout);
    } else {
      mobileQuery.addListener(syncLayout);
    }

    return () => {
      if (typeof mobileQuery.removeEventListener === 'function') {
        mobileQuery.removeEventListener('change', syncLayout);
      } else {
        mobileQuery.removeListener(syncLayout);
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
    isViewportLayoutReady,
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
