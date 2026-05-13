import { useEffect, useLayoutEffect, useState, type RefObject } from 'react';
import { VIEWPORT_LAYOUT_CHANGE_EVENT } from '@/components/layout/ViewportHeightSync';
import { recordScrollDebugEvent } from '../../scrollDebug';
import { resolveChatLayoutState, resolveInitialChatLayoutState } from './chatLayoutState';

const VIEWPORT_LAYOUT_READY_IDLE_MS = 160;

type UseChatLayoutStateParams = {
  centerHeaderRef: RefObject<HTMLElement | null>;
  headerObservationKey?: string;
};

export function useChatLayoutState({
  centerHeaderRef,
  headerObservationKey,
}: UseChatLayoutStateParams) {
  const initialLayoutState = resolveInitialChatLayoutState({
    viewportWidth: typeof window === 'undefined' ? null : window.innerWidth,
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
  }, [centerHeaderRef, headerObservationKey]);

  useLayoutEffect(() => {
    const syncLayout = () => {
      const nextLayoutState = resolveChatLayoutState({
        viewportWidth: window.innerWidth,
      });

      setIsMobileLayout(nextLayoutState.isMobileLayout);
      setIsChatSidebarOpen(nextLayoutState.isChatSidebarOpen);
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'layout:syncLayout',
        detail: {
          nextIsMobile: nextLayoutState.isMobileLayout,
          nextViewportWidth: nextLayoutState.viewportWidth,
          nextUsesLeftSidebarOverlay: !nextLayoutState.isChatSidebarOpen,
        },
      });
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
    window.addEventListener('resize', syncLayout, { passive: true });
    window.visualViewport?.addEventListener('resize', syncLayout);

    return () => {
      window.removeEventListener('resize', syncLayout);
      window.visualViewport?.removeEventListener('resize', syncLayout);
    };
  }, []);

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

  return {
    centerHeaderWidth,
    chatIdCopyState,
    expandedActionRunIds,
    expandedResultIds,
    highlightedEventId,
    idBundleCopyState,
    isChatSidebarOpen,
    isContextMenuOpen,
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
    setShowPermissionQueue,
    showPermissionQueue,
    toggleDebugMode,
  };
}
