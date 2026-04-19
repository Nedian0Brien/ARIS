import { describe, expect, it } from 'vitest';
import type { UiEvent } from '@/lib/happy/types';
import {
  MAX_LOADED_EVENT_PAGES,
  appendIncomingCountToPageSizes,
  trimEventsPageWindow,
} from '@/lib/hooks/useSessionEvents';

function buildEvents(count: number): UiEvent[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `event-${index + 1}`,
    timestamp: `2026-04-19T10:${String(index).padStart(2, '0')}:00.000Z`,
    kind: 'text_reply',
    title: `Event ${index + 1}`,
    body: `Body ${index + 1}`,
  }));
}

describe('session event page window helpers', () => {
  it('fills the current latest page before creating a new page size bucket', () => {
    expect(appendIncomingCountToPageSizes([35], 10, 40)).toEqual([40, 5]);
    expect(appendIncomingCountToPageSizes([40, 40], 3, 40)).toEqual([40, 40, 3]);
  });

  it('trims oldest pages when latest-side growth exceeds the max page window', () => {
    const events = buildEvents(130);

    expect(trimEventsPageWindow({
      events,
      pageSizes: [40, 40, 40, 10],
      maxPages: MAX_LOADED_EVENT_PAGES,
      trimFrom: 'start',
    })).toEqual({
      events: buildEvents(90).map((event, index) => ({
        ...event,
        id: `event-${index + 41}`,
        title: `Event ${index + 41}`,
        body: `Body ${index + 41}`,
        timestamp: `2026-04-19T10:${String(index + 40).padStart(2, '0')}:00.000Z`,
      })),
      pageSizes: [40, 40, 10],
      trimmedCount: 40,
    });
  });

  it('trims newest pages when older-side paging exceeds the max page window', () => {
    const events = buildEvents(130);

    expect(trimEventsPageWindow({
      events,
      pageSizes: [10, 40, 40, 40],
      maxPages: MAX_LOADED_EVENT_PAGES,
      trimFrom: 'end',
    })).toEqual({
      events: buildEvents(90),
      pageSizes: [10, 40, 40],
      trimmedCount: 40,
    });
  });
});
