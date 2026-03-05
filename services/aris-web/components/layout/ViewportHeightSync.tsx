'use client';

import { useEffect } from 'react';

export function ViewportHeightSync() {
  useEffect(() => {
    const root = document.documentElement;

    const updateViewportHeight = () => {
      const innerHeight = window.innerHeight;
      const vh = innerHeight * 0.01;
      root.style.setProperty('--vh', `${vh}px`);
      root.style.setProperty('--app-vh', `${innerHeight}px`);
    };

    updateViewportHeight();

    window.addEventListener('resize', updateViewportHeight, { passive: true });
    window.addEventListener('orientationchange', updateViewportHeight, { passive: true });

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.removeEventListener('orientationchange', updateViewportHeight);
    };
  }, []);

  return null;
}
