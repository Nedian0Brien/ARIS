'use client';

import { useEffect } from 'react';

function isIOSSafari(): boolean {
  if (typeof navigator === 'undefined') {
    return false;
  }
  const ua = navigator.userAgent;
  return /iP(hone|ad|od)/.test(ua) && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
}

function withMaximumScaleOne(content: string): string {
  const tokens = content
    .split(',')
    .map((token) => token.trim())
    .filter(Boolean)
    .filter((token) => !token.startsWith('maximum-scale='));

  tokens.push('maximum-scale=1');
  return tokens.join(', ');
}

export function ViewportHeightSync() {
  useEffect(() => {
    const root = document.documentElement;

    const updateViewportHeight = () => {
      // visualViewport.height는 iOS Safari 주소창 슬라이드 시 정확한 높이를 반환
      // window.innerHeight는 주소창 변화에 resize 이벤트가 발생하지 않을 수 있음
      const height = window.visualViewport?.height ?? window.innerHeight;
      const vh = height * 0.01;
      root.style.setProperty('--vh', `${vh}px`);
      root.style.setProperty('--app-vh', `${height}px`);
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
    };
  }, []);

  useEffect(() => {
    if (!isIOSSafari()) {
      return;
    }

    const viewportMeta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!viewportMeta) {
      return;
    }

    const original = viewportMeta.content || 'width=device-width, initial-scale=1, viewport-fit=cover';
    const next = withMaximumScaleOne(original);
    if (next !== viewportMeta.content) {
      viewportMeta.content = next;
    }

    return () => {
      if (viewportMeta.content === next) {
        viewportMeta.content = original;
      }
    };
  }, []);

  return null;
}
