import { describe, expect, it } from 'vitest';
import type { UiEvent } from '@/lib/happy/types';
import { getScopedSessionEvents } from '@/lib/hooks/useSessionEvents';

function buildEvent(overrides: Partial<UiEvent> = {}): UiEvent {
  return {
    id: overrides.id ?? 'event-1',
    timestamp: overrides.timestamp ?? '2026-03-19T09:00:00.000Z',
    kind: overrides.kind ?? 'text_reply',
    title: overrides.title ?? 'Text Reply',
    body: overrides.body ?? 'hello',
    ...(overrides.meta ? { meta: overrides.meta } : {}),
  };
}

describe('getScopedSessionEvents', () => {
  it('returns an empty list when the current events belong to a different chat', () => {
    const staleEvents = [buildEvent({
      id: 'event-stale-1',
      body: '이전 채팅 내용',
      meta: { chatId: 'chat-old' },
    })];

    expect(getScopedSessionEvents(staleEvents, 'chat-old', 'chat-new')).toEqual([]);
  });

  it('returns the original events when the active chat matches', () => {
    const currentEvents = [buildEvent({
      id: 'event-current-1',
      body: '현재 채팅 내용',
      meta: { chatId: 'chat-new' },
    })];

    expect(getScopedSessionEvents(currentEvents, 'chat-new', 'chat-new')).toEqual(currentEvents);
  });
});
