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
});
