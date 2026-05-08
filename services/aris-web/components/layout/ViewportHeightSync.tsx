'use client';

import { useEffect } from 'react';
import { dispatchSessionScrollPhaseEvent } from '@/app/sessions/[sessionId]/useSessionScrollOrchestrator';
import { recordScrollDebugEvent } from '@/app/sessions/[sessionId]/scrollDebug';

export const VIEWPORT_LAYOUT_CHANGE_EVENT = 'aris:viewport-layout-change';

export function ViewportHeightSync() {
  useEffect(() => {
    const root = document.documentElement;
    let lastNoKeyboardHeight = window.visualViewport?.height ?? window.innerHeight;
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
        lastNoKeyboardHeight = height;
        lastInnerWidth = innerWidth;
      }

      // bottomInset = layout viewport에서 visible viewport와 top offset을 뺀 나머지.
      // iOS Safari 하단 툴바, 하단 URL바, 또는 가상 키보드가 점유하는 영역.
      const bottomInset = Math.max(0, layoutViewportHeight - height - viewportOffsetTop);
      const keyboardOpen = bottomInset > 120;
      const keyboardInset = keyboardOpen ? bottomInset : 0;
      const visualViewportBottomInset = keyboardOpen ? 0 : bottomInset;

      // 키보드가 닫혀 있는 동안에는 --app-vh가 현재 visible viewport를 그대로 따라가도록 한다.
      // (이 잠금을 풀지 않으면 maxViewportHeight가 URL바 숨김 상태로 굳어져서 외부 스크롤이 발생한다.)
      // 키보드가 열린 동안에만 직전 닫힘 상태의 높이로 고정해서 채팅 컨테이너 reflow를 방지한다.
      if (!keyboardOpen) {
        lastNoKeyboardHeight = height;
      }
      const appViewportHeight = keyboardOpen ? lastNoKeyboardHeight : height;

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
          lastNoKeyboardHeight,
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
