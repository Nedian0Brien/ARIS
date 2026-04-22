import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  clearScrollDebugEvents,
  readScrollDebugEvents,
  recordScrollDebugEvent,
} from '@/app/sessions/[sessionId]/scrollDebug';

describe('scrollDebug', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('stays silent when debug mode is disabled', () => {
    vi.stubGlobal('window', {
      location: { search: '' },
      localStorage: { getItem: () => null },
    });

    recordScrollDebugEvent({
      kind: 'write',
      source: 'tail:window',
      top: 120,
    });

    expect(readScrollDebugEvents()).toEqual([]);
  });

  it('records events when the storage flag enables scroll debug', () => {
    const debugStore = {
      enabled: false,
      events: [] as ReturnType<typeof readScrollDebugEvents>,
    };

    vi.stubGlobal('window', {
      __ARIS_SCROLL_DEBUG__: debugStore,
      location: { search: '' },
      localStorage: { getItem: (key: string) => (key === 'aris:scroll-debug' ? '1' : null) },
    });

    recordScrollDebugEvent({
      kind: 'phase',
      source: 'session-scroll',
      phase: 'resuming',
    });

    expect(readScrollDebugEvents()).toHaveLength(1);
    expect(readScrollDebugEvents()[0]).toMatchObject({
      kind: 'phase',
      source: 'session-scroll',
      phase: 'resuming',
    });

    clearScrollDebugEvents();
    expect(readScrollDebugEvents()).toEqual([]);
  });

  it('captures a stream-centric snapshot by default', () => {
    const debugStore = {
      enabled: true,
      events: [] as ReturnType<typeof readScrollDebugEvents>,
    };

    vi.stubGlobal('window', {
      __ARIS_SCROLL_DEBUG__: debugStore,
      location: { search: '' },
      localStorage: { getItem: () => '1' },
      innerHeight: 844,
      visualViewport: {
        height: 812,
        offsetTop: 24,
      },
    });
    vi.stubGlobal('document', {
      documentElement: {
        dataset: { keyboardOpen: 'true' },
      },
    });

    const getBoundingClientRect = () => ({
      top: 96,
      bottom: 672,
    });

    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'tail:sync',
      streamElement: {
        scrollTop: 480,
        scrollHeight: 1640,
        clientHeight: 576,
        getBoundingClientRect,
      } as Pick<HTMLElement, 'scrollTop' | 'scrollHeight' | 'clientHeight' | 'getBoundingClientRect'>,
    });

    expect(readScrollDebugEvents()).toHaveLength(1);
    expect(readScrollDebugEvents()[0]?.snapshot).toEqual({
      scrollOwner: 'stream',
      keyboardOpen: true,
      streamScrollTop: 480,
      streamScrollHeight: 1640,
      streamClientHeight: 576,
      streamBottomGap: 584,
      streamViewportTop: 96,
      streamViewportBottom: 672,
      streamScrollable: true,
      viewportHeight: 812,
      viewportOffsetTop: 24,
    });
  });
});
