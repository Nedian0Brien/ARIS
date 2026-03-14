import { describe, expect, it } from 'vitest';
import type { UiEvent } from '@/lib/happy/types';
import { collapseRealtimeGeminiPartialEvents } from '@/lib/hooks/useSessionEvents';

function buildEvent(overrides: Partial<UiEvent> = {}): UiEvent {
  return {
    id: overrides.id ?? 'event-1',
    timestamp: overrides.timestamp ?? '2026-03-14T04:00:00.000Z',
    kind: overrides.kind ?? 'text_reply',
    title: overrides.title ?? 'Text Reply',
    body: overrides.body ?? 'hello',
    ...(overrides.meta ? { meta: overrides.meta } : {}),
  };
}

describe('collapseRealtimeGeminiPartialEvents', () => {
  it('keeps the latest Gemini partial event visible while a turn is streaming', () => {
    const partial = buildEvent({
      id: 'gemini-partial:session:turn-1:msg-1',
      body: '실시간 응답',
      meta: {
        agent: 'gemini',
        streamEvent: 'agent_message_partial',
        sessionTurnId: 'turn-1',
        sessionItemId: 'msg-1',
        threadId: 'thread-1',
      },
    });

    expect(collapseRealtimeGeminiPartialEvents([partial])).toEqual([partial]);
  });

  it('drops Gemini partial events once the final persisted message for the same turn/item arrives', () => {
    const partial = buildEvent({
      id: 'gemini-partial:session:turn-1:msg-1',
      timestamp: '2026-03-14T04:00:00.000Z',
      body: '실시간 응답',
      meta: {
        agent: 'gemini',
        streamEvent: 'agent_message_partial',
        sessionTurnId: 'turn-1',
        sessionItemId: 'msg-1',
        threadId: 'thread-1',
      },
    });
    const final = buildEvent({
      id: 'persisted-final-1',
      timestamp: '2026-03-14T04:00:01.000Z',
      body: '실시간 응답 완료',
      meta: {
        agent: 'gemini',
        streamEvent: 'agent_message',
        sessionTurnId: 'turn-1',
        sessionItemId: 'msg-1',
        threadId: 'thread-1',
      },
    });

    expect(collapseRealtimeGeminiPartialEvents([partial, final])).toEqual([final]);
  });
});
