'use client';

export type ScrollDebugEvent = {
  at: number;
  kind: 'write' | 'trigger' | 'phase';
  source: string;
  top?: number | null;
  behavior?: ScrollBehavior | null;
  phase?: string | null;
  detail?: Record<string, unknown>;
};

type ScrollDebugStore = {
  enabled: boolean;
  events: ScrollDebugEvent[];
};

declare global {
  interface Window {
    __ARIS_SCROLL_DEBUG__?: ScrollDebugStore;
  }
}

const MAX_SCROLL_DEBUG_EVENTS = 200;
const SCROLL_DEBUG_QUERY = 'scrollDebug=1';
const SCROLL_DEBUG_STORAGE_KEY = 'aris:scroll-debug';

function hasScrollDebugQuery(): boolean {
  try {
    return window.location.search.includes(SCROLL_DEBUG_QUERY);
  } catch {
    return false;
  }
}

function hasScrollDebugStorageFlag(): boolean {
  try {
    return window.localStorage.getItem(SCROLL_DEBUG_STORAGE_KEY) === '1';
  } catch {
    return false;
  }
}

function getScrollDebugStore(): ScrollDebugStore | null {
  if (typeof window === 'undefined') {
    return null;
  }

  const enabled = window.__ARIS_SCROLL_DEBUG__?.enabled === true
    || hasScrollDebugQuery()
    || hasScrollDebugStorageFlag();

  if (!enabled) {
    return null;
  }

  if (!window.__ARIS_SCROLL_DEBUG__) {
    window.__ARIS_SCROLL_DEBUG__ = {
      enabled: true,
      events: [],
    };
  }

  window.__ARIS_SCROLL_DEBUG__.enabled = true;
  return window.__ARIS_SCROLL_DEBUG__;
}

export function recordScrollDebugEvent(event: Omit<ScrollDebugEvent, 'at'>) {
  const store = getScrollDebugStore();
  if (!store) {
    return;
  }

  const nextEvent: ScrollDebugEvent = {
    at: Date.now(),
    ...event,
  };

  store.events.push(nextEvent);
  if (store.events.length > MAX_SCROLL_DEBUG_EVENTS) {
    store.events.splice(0, store.events.length - MAX_SCROLL_DEBUG_EVENTS);
  }

  console.debug('[aris-scroll-debug]', nextEvent);
}

export function clearScrollDebugEvents() {
  const store = getScrollDebugStore();
  if (!store) {
    return;
  }
  store.events.length = 0;
}

export function readScrollDebugEvents(): ScrollDebugEvent[] {
  const store = getScrollDebugStore();
  return store ? [...store.events] : [];
}
