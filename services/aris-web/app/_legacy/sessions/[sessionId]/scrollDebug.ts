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
  scrollOwner: 'stream';
  keyboardOpen: boolean;
  streamScrollTop: number | null;
  streamScrollHeight: number | null;
  streamClientHeight: number | null;
  streamBottomGap: number | null;
  streamViewportTop: number | null;
  streamViewportBottom: number | null;
  streamScrollable: boolean | null;
  viewportHeight: number | null;
  viewportOffsetTop: number | null;
};

type ScrollDebugStreamElement = Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight'>
  & Partial<Pick<HTMLElement, 'getBoundingClientRect'>>;

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
  streamElement?: ScrollDebugStreamElement | null,
): ScrollDebugSnapshot | null {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return null;
  }

  const streamRect = typeof streamElement?.getBoundingClientRect === 'function'
    ? streamElement.getBoundingClientRect()
    : null;
  const streamBottomGap = streamElement
    ? Math.max(0, streamElement.scrollHeight - streamElement.scrollTop - streamElement.clientHeight)
    : null;

  return {
    scrollOwner: 'stream',
    keyboardOpen: document.documentElement.dataset.keyboardOpen === 'true',
    streamScrollTop: streamElement?.scrollTop ?? null,
    streamScrollHeight: streamElement?.scrollHeight ?? null,
    streamClientHeight: streamElement?.clientHeight ?? null,
    streamBottomGap,
    streamViewportTop: streamRect?.top ?? null,
    streamViewportBottom: streamRect?.bottom ?? null,
    streamScrollable: streamElement
      ? (streamElement.scrollHeight - streamElement.clientHeight > 1)
      : null,
    viewportHeight: window.visualViewport?.height ?? window.innerHeight ?? null,
    viewportOffsetTop: window.visualViewport?.offsetTop ?? null,
  };
}

export function recordScrollDebugEvent(
  event: Omit<ScrollDebugEvent, 'at' | 'snapshot'> & {
    snapshot?: ScrollDebugSnapshot | null;
    streamElement?: ScrollDebugStreamElement | null;
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
