'use client';

import { useEffect } from 'react';

export function ViewportHeightSync() {
  useEffect(() => {
    const root = document.documentElement;
    let maxViewportHeight = window.visualViewport?.height ?? window.innerHeight;

    const updateViewportHeight = () => {
      // visualViewport.height는 iOS Safari 주소창 슬라이드 시 정확한 높이를 반환
      // window.innerHeight는 주소창 변화에 resize 이벤트가 발생하지 않을 수 있음
      const height = window.visualViewport?.height ?? window.innerHeight;
      if (height > maxViewportHeight) {
        maxViewportHeight = height;
      }
      const keyboardInset = Math.max(0, maxViewportHeight - height);
      const keyboardOpen = keyboardInset > 120;
      const vh = height * 0.01;
      root.style.setProperty('--vh', `${vh}px`);
      root.style.setProperty('--app-vh', `${height}px`);
      root.style.setProperty('--keyboard-inset-height', `${keyboardInset}px`);
      root.dataset.keyboardOpen = keyboardOpen ? 'true' : 'false';
    };

    updateViewportHeight();

    window.addEventListener('resize', updateViewportHeight, { passive: true });
    window.addEventListener('orientationchange', updateViewportHeight, { passive: true });

    // iOS Safari: 주소창이 나타나거나 사라질 때 visualViewport resize/scroll 이벤트가 발생
    // window.resize는 이 경우 발생하지 않아 --vh가 stale해지는 문제 해결
    window.visualViewport?.addEventListener('resize', updateViewportHeight, { passive: true } as EventListenerOptions);
    window.visualViewport?.addEventListener('scroll', updateViewportHeight, { passive: true } as EventListenerOptions);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('orientationchange', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight);
      delete root.dataset.keyboardOpen;
      root.style.removeProperty('--keyboard-inset-height');
    };
  }, []);

  return null;
}
