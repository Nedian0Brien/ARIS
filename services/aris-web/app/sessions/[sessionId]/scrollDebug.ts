'use client';

export type ScrollDebugEvent = {
  at: number;
  kind: 'write' | 'trigger' | 'phase';
  source: string;
  top?: number | null;
  behavior?: ScrollBehavior | null;
  phase?: string | null;
  snapshot?: ScrollDebugSnapshot | null;
  detail?: Record<string, unknown>;
};

export type ScrollDebugSnapshot = {
  windowScrollTop: number;
  documentScrollHeight: number;
  documentClientHeight: number;
  windowInnerHeight: number;
  windowInnerWidth: number;
  visualViewportHeight: number | null;
  visualViewportOffsetTop: number | null;
  visualViewportPageTop: number | null;
  keyboardOpen: boolean;
  streamScrollTop: number | null;
  streamScrollHeight: number | null;
  streamClientHeight: number | null;
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

const MAX_SCROLL_DEBUG_EVENTS = 1000;
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

export function createScrollDebugSnapshot(
  streamElement?: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'> | null,
): ScrollDebugSnapshot | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  return {
    windowScrollTop: Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0),
    documentScrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    documentClientHeight: document.documentElement.clientHeight,
    windowInnerHeight: window.innerHeight || 0,
    windowInnerWidth: window.innerWidth || 0,
    visualViewportHeight: window.visualViewport?.height ?? null,
    visualViewportOffsetTop: window.visualViewport?.offsetTop ?? null,
    visualViewportPageTop: window.visualViewport?.pageTop ?? null,
    keyboardOpen: document.documentElement.dataset.keyboardOpen === 'true',
    streamScrollTop: streamElement?.scrollTop ?? null,
    streamScrollHeight: streamElement?.scrollHeight ?? null,
    streamClientHeight: streamElement?.clientHeight ?? null,
  };
}

export function recordScrollDebugEvent(
  event: Omit<ScrollDebugEvent, 'at' | 'snapshot'> & {
    snapshot?: ScrollDebugSnapshot | null;
    streamElement?: Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'> | null;
  },
) {
  const store = getScrollDebugStore();
  if (!store) {
    return;
  }

  const {
    streamElement,
    snapshot = createScrollDebugSnapshot(streamElement),
    ...rest
  } = event;
  const nextEvent: ScrollDebugEvent = {
    at: Date.now(),
    ...rest,
    snapshot,
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
