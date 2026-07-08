'use client';

import { useEffect } from 'react';
import { dispatchSessionScrollPhaseEvent } from '@/lib/hooks/useSessionScrollOrchestrator';
import { recordScrollDebugEvent } from '@/lib/scroll/scrollDebug';

export const VIEWPORT_LAYOUT_CHANGE_EVENT = 'aris:viewport-layout-change';

const KEYBOARD_INSET_THRESHOLD_DEFAULT_PX = 120;
// 입력 요소가 포커스 상태일 때는 키보드일 가능성이 높으므로 임계값을 낮춰
// 작은 가상 키보드/부분 키보드/키보드 애니메이션 중간 상태에서도 inset이 적용되도록 한다.
const KEYBOARD_INSET_THRESHOLD_FOCUSED_PX = 60;
// 포커스 시점에 곧바로 data-keyboard-open을 낙관적으로 켜 두는 기간(ms).
// visualViewport의 resize 이벤트는 키보드 애니메이션이 "시작된 이후"에만
// 도착하는데, iOS/Android의 네이티브 "포커스 요소를 화면에 보이도록 스크롤"은
// 포커스 시점에 훨씬 즉각적으로 실행될 수 있다. resize를 기다렸다가 잠그면
// 그 경합에서 항상 늦으므로, 포커스 이벤트 자체에서 곧장 잠근다. 실제 인셋
// 측정(재sync 스케줄과 동일하게 100/300/600ms)이 이 창 안에서 이어받는다.
const OPTIMISTIC_KEYBOARD_LOCK_MS = 700;

const isTextInputElement = (element: Element | null): boolean => {
  if (!element) return false;
  const tag = element.tagName;
  if (tag === 'TEXTAREA') return true;
  if (tag === 'INPUT') {
    const type = (element as HTMLInputElement).type?.toLowerCase();
    // checkbox/radio/file/button 등은 포커스되어도 키보드를 띄우지 않는다.
    return type !== 'checkbox' && type !== 'radio' && type !== 'button'
      && type !== 'submit' && type !== 'reset' && type !== 'file'
      && type !== 'color' && type !== 'range' && type !== 'image';
  }
  return (element as HTMLElement).isContentEditable === true;
};

export function ViewportHeightSync() {
  useEffect(() => {
    const root = document.documentElement;
    let lastNoKeyboardHeight = window.visualViewport?.height ?? window.innerHeight;
    let lastInnerWidth = window.innerWidth;
    let optimisticKeyboardOpenUntil = 0;
    let previousMetrics: {
      appViewportHeight: number;
      height: number;
      keyboardInset: number;
      visualViewportBottomInset: number;
      viewportOffsetTop: number;
    } | null = null;
    const focusResyncTimeouts: number[] = [];

    const clearFocusResyncTimeouts = () => {
      while (focusResyncTimeouts.length > 0) {
        const id = focusResyncTimeouts.pop();
        if (typeof id === 'number') {
          window.clearTimeout(id);
        }
      }
    };

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
      // 입력 요소가 포커스되어 있다면 가상 키보드일 가능성이 높으므로
      // URL바와 키보드를 구분하는 임계값을 낮춰 키보드 inset이 끊기는 회귀를 막는다.
      const focusedTextInput = isTextInputElement(document.activeElement);
      const threshold = focusedTextInput
        ? KEYBOARD_INSET_THRESHOLD_FOCUSED_PX
        : KEYBOARD_INSET_THRESHOLD_DEFAULT_PX;
      const withinOptimisticWindow = performance.now() < optimisticKeyboardOpenUntil;
      const keyboardOpen = bottomInset > threshold || withinOptimisticWindow;
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
          threshold,
          focusedTextInput,
          withinOptimisticWindow,
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
    // iOS Safari: 입력 요소에 포커스되는 순간 키보드 애니메이션이 시작되지만
    // visualViewport.resize는 애니메이션 도중 한두 프레임 늦게 또는 중간 값으로
    // 한 차례만 발화할 수 있다. focus 시점에 강제 sync + 100/300/600ms 후 재sync해서
    // 키보드 최종 높이가 안정된 시점에 inset CSS 변수가 확실히 반영되도록 한다.
    const handleDocumentFocusIn = (event: FocusEvent) => {
      if (!isTextInputElement(event.target as Element | null)) {
        return;
      }
      // 실제 visualViewport resize를 기다리지 않고 포커스 시점에 곧바로
      // 낙관적으로 잠근다 — 네이티브 스크롤과의 경합에서 이겨야 하므로,
      // 아직 키보드 인셋을 측정하지 못했더라도 먼저 잠그고 본다.
      optimisticKeyboardOpenUntil = performance.now() + OPTIMISTIC_KEYBOARD_LOCK_MS;
      clearFocusResyncTimeouts();
      updateViewportHeight('document:focusin');
      [100, 300, 600].forEach((delay) => {
        const id = window.setTimeout(() => {
          updateViewportHeight(`document:focusin:resync:${delay}ms`);
        }, delay);
        focusResyncTimeouts.push(id);
      });
    };
    const handleDocumentFocusOut = (event: FocusEvent) => {
      if (!isTextInputElement(event.target as Element | null)) {
        return;
      }
      // 낙관적 잠금을 즉시 해제한다 — 실제로 키보드가 열려 있었다면 곧이어
      // 실행되는 updateViewportHeight가 측정값으로 다시 true를 확인해 준다.
      optimisticKeyboardOpenUntil = 0;
      clearFocusResyncTimeouts();
      // 키보드가 닫히는 애니메이션도 한 번에 끝나지 않을 수 있어 같은 패턴으로 재sync.
      updateViewportHeight('document:focusout');
      [100, 300, 600].forEach((delay) => {
        const id = window.setTimeout(() => {
          updateViewportHeight(`document:focusout:resync:${delay}ms`);
        }, delay);
        focusResyncTimeouts.push(id);
      });
    };

    updateViewportHeight('mount');

    window.addEventListener('resize', handleWindowResize, { passive: true });
    window.addEventListener('orientationchange', handleOrientationChange, { passive: true });

    // iOS Safari: 주소창이 나타나거나 사라질 때 visualViewport resize/scroll 이벤트가 발생
    // window.resize는 이 경우 발생하지 않아 --vh가 stale해지는 문제 해결
    window.visualViewport?.addEventListener('resize', handleVisualViewportResize, { passive: true } as EventListenerOptions);
    window.visualViewport?.addEventListener('scroll', handleVisualViewportScroll, { passive: true } as EventListenerOptions);
    document.addEventListener('focusin', handleDocumentFocusIn, { passive: true } as EventListenerOptions);
    document.addEventListener('focusout', handleDocumentFocusOut, { passive: true } as EventListenerOptions);

    return () => {
      clearFocusResyncTimeouts();
      window.removeEventListener('resize', handleWindowResize);
      window.removeEventListener('orientationchange', handleOrientationChange);
      window.visualViewport?.removeEventListener('resize', handleVisualViewportResize);
      window.visualViewport?.removeEventListener('scroll', handleVisualViewportScroll);
      document.removeEventListener('focusin', handleDocumentFocusIn);
      document.removeEventListener('focusout', handleDocumentFocusOut);
      delete root.dataset.keyboardOpen;
      root.style.removeProperty('--keyboard-inset-height');
      root.style.removeProperty('--visual-viewport-bottom-inset');
      root.style.removeProperty('--visual-viewport-height');
      root.style.removeProperty('--visual-viewport-offset-top');
    };
  }, []);

  return null;
}
