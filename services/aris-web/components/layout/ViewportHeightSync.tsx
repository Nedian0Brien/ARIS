'use client';

import { useEffect } from 'react';
import { dispatchSessionScrollPhaseEvent } from '@/app/sessions/[sessionId]/useSessionScrollOrchestrator';
import { recordScrollDebugEvent } from '@/app/sessions/[sessionId]/scrollDebug';

export const VIEWPORT_LAYOUT_CHANGE_EVENT = 'aris:viewport-layout-change';

export function ViewportHeightSync() {
  useEffect(() => {
    const root = document.documentElement;
    let maxViewportHeight = window.visualViewport?.height ?? window.innerHeight;
    let lastInnerWidth = window.innerWidth;
    let previousMetrics: {
      appViewportHeight: number;
      height: number;
      keyboardInset: number;
      visualViewportBottomInset: number;
      viewportOffsetTop: number;
    } | null = null;

    const updateViewportHeight = (reason: string) => {
      // visualViewport.height는 iOS Safari 주소창 슬라이드 시 정확한 높이를 반환
      // window.innerHeight는 주소창 변화에 resize 이벤트가 발생하지 않을 수 있음
      const height = window.visualViewport?.height ?? window.innerHeight;
      const viewportOffsetTop = window.visualViewport?.offsetTop ?? 0;
      const innerWidth = window.innerWidth;
      const layoutViewportHeight = window.innerHeight;
      const orientationChanged = Math.abs(innerWidth - lastInnerWidth) > 120;
      if (orientationChanged) {
        maxViewportHeight = height;
        lastInnerWidth = innerWidth;
      }
      if (height > maxViewportHeight) {
        maxViewportHeight = height;
      }
      const historicalBottomInset = Math.max(0, maxViewportHeight - height - viewportOffsetTop);
      const layoutBottomInset = Math.max(0, layoutViewportHeight - height - viewportOffsetTop);
      const visualViewportBottomInset = Math.max(historicalBottomInset, layoutBottomInset);
      const keyboardInset = visualViewportBottomInset;
      const keyboardOpen = keyboardInset > 120;
      const appViewportHeight = keyboardOpen ? height : maxViewportHeight;
      const vh = height * 0.01;
      root.style.setProperty('--vh', `${vh}px`);
      root.style.setProperty('--app-vh', `${appViewportHeight}px`);
      root.style.setProperty('--visual-viewport-height', `${height}px`);
      root.style.setProperty('--visual-viewport-offset-top', `${viewportOffsetTop}px`);
      root.style.setProperty('--visual-viewport-bottom-inset', `${visualViewportBottomInset}px`);
      root.style.setProperty('--keyboard-inset-height', `${keyboardInset}px`);
      root.dataset.keyboardOpen = keyboardOpen ? 'true' : 'false';
      const nextMetrics = {
        appViewportHeight,
        height,
        keyboardInset,
        visualViewportBottomInset,
        viewportOffsetTop,
      };
      const metricsChanged = previousMetrics === null
        || previousMetrics.appViewportHeight !== nextMetrics.appViewportHeight
        || previousMetrics.height !== nextMetrics.height
        || previousMetrics.keyboardInset !== nextMetrics.keyboardInset
        || previousMetrics.visualViewportBottomInset !== nextMetrics.visualViewportBottomInset
        || previousMetrics.viewportOffsetTop !== nextMetrics.viewportOffsetTop;
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'viewport:updateViewportHeight',
        detail: {
          reason,
          metricsChanged,
          ...nextMetrics,
          layoutViewportHeight,
          maxViewportHeight,
          keyboardOpen,
        },
      });
      if (metricsChanged) {
        previousMetrics = nextMetrics;
        dispatchSessionScrollPhaseEvent('viewport-changed');
        window.dispatchEvent(new CustomEvent(VIEWPORT_LAYOUT_CHANGE_EVENT, {
          detail: nextMetrics,
        }));
      }
    };

    const handleWindowResize = () => {
      updateViewportHeight('window:resize');
    };
    const handleOrientationChange = () => {
      updateViewportHeight('window:orientationchange');
    };
    const handleVisualViewportResize = () => {
      updateViewportHeight('visualViewport:resize');
    };
    const handleVisualViewportScroll = () => {
      updateViewportHeight('visualViewport:scroll');
    };

    updateViewportHeight('mount');

    window.addEventListener('resize', handleWindowResize, { passive: true });
    window.addEventListener('orientationchange', handleOrientationChange, { passive: true });

    // iOS Safari: 주소창이 나타나거나 사라질 때 visualViewport resize/scroll 이벤트가 발생
    // window.resize는 이 경우 발생하지 않아 --vh가 stale해지는 문제 해결
    window.visualViewport?.addEventListener('resize', handleVisualViewportResize, { passive: true } as EventListenerOptions);
    window.visualViewport?.addEventListener('scroll', handleVisualViewportScroll, { passive: true } as EventListenerOptions);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.visualViewport?.removeEventListener('resize', handleVisualViewportResize);
      window.visualViewport?.removeEventListener('scroll', handleVisualViewportScroll);
      delete root.dataset.keyboardOpen;
      root.style.removeProperty('--keyboard-inset-height');
      root.style.removeProperty('--visual-viewport-bottom-inset');
      root.style.removeProperty('--visual-viewport-height');
      root.style.removeProperty('--visual-viewport-offset-top');
    };
  }, []);

  return null;
}
