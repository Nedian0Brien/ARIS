'use client';

import { useCallback, useEffect, useState } from 'react';

export const SIDEBAR_WIDTH_MIN = 200;
export const SIDEBAR_WIDTH_MAX = 400;
export const SIDEBAR_WIDTH_DEFAULT = 240;
const STORAGE_KEY = 'aris-sidebar-width';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function useSidebarWidth(): readonly [number, (next: number) => void] {
  const [width, setWidth] = useState<number>(SIDEBAR_WIDTH_DEFAULT);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw === null) return;
      const parsed = Number.parseInt(raw, 10);
      if (Number.isFinite(parsed)) {
        setWidth(clamp(parsed, SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX));
      }
    } catch {
      // localStorage may throw in private/quota contexts; ignore
    }
  }, []);

  const setAndPersist = useCallback((next: number) => {
    const clamped = clamp(Math.round(next), SIDEBAR_WIDTH_MIN, SIDEBAR_WIDTH_MAX);
    setWidth(clamped);
    try {
      window.localStorage.setItem(STORAGE_KEY, String(clamped));
    } catch {
      // ignore
    }
  }, []);

  return [width, setAndPersist] as const;
}
