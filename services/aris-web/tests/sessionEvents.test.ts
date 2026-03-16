import { describe, expect, it } from 'vitest';
import type { UiEvent } from '@/lib/happy/types';
import {
  collapseRealtimeGeminiPartialEvents,
  findLatestPersistedCursorEventId,
} from '@/lib/hooks/useSessionEvents';

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

  it('keeps commentary partials separate from the final answer stream and drops them only after commentary persists', () => {
    const commentaryPartial = buildEvent({
      id: 'gemini-partial:session:commentary-turn-1:thought-1',
      timestamp: '2026-03-14T04:00:00.000Z',
      title: 'Commentary',
      body: '먼저 README를 확인하겠습니다.',
      meta: {
        agent: 'gemini',
        streamEvent: 'agent_commentary_partial',
        messagePhase: 'commentary',
        sessionTurnId: 'turn-1',
        sessionItemId: 'thought-1',
        threadId: 'thread-1',
      },
    });
    const commentaryFinal = buildEvent({
      id: 'persisted-commentary-1',
      timestamp: '2026-03-14T04:00:01.000Z',
      title: 'Commentary',
      body: '먼저 README를 확인하겠습니다.',
      meta: {
        agent: 'gemini',
        streamEvent: 'agent_commentary',
        messagePhase: 'commentary',
        sessionTurnId: 'turn-1',
        sessionItemId: 'thought-1',
        threadId: 'thread-1',
      },
    });
    const finalAnswer = buildEvent({
      id: 'persisted-final-2',
      timestamp: '2026-03-14T04:00:02.000Z',
      body: 'README 요약입니다.',
      meta: {
        agent: 'gemini',
        streamEvent: 'agent_message',
        sessionTurnId: 'turn-1',
        sessionItemId: 'answer-1',
        threadId: 'thread-1',
      },
    });

    expect(collapseRealtimeGeminiPartialEvents([commentaryPartial, finalAnswer])).toEqual([
      commentaryPartial,
      finalAnswer,
    ]);
    expect(collapseRealtimeGeminiPartialEvents([commentaryPartial, commentaryFinal, finalAnswer])).toEqual([
      commentaryFinal,
      finalAnswer,
    ]);
  });
});

describe('collapseRealtimeGeminiPartialEvents - pending actions', () => {
  it('keeps pending action visible while DB event has not arrived yet', () => {
    const pending = buildEvent({
      id: 'gemini-action-pending:call-1',
      kind: 'run_execution',
      title: 'Run',
      body: '$ ls -la',
      meta: {
        agent: 'gemini',
        streamEvent: 'gemini_action_pending',
        sessionCallId: 'call-1',
      },
    });

    expect(collapseRealtimeGeminiPartialEvents([pending])).toEqual([pending]);
  });

  it('drops pending action once the final persisted action for the same callId arrives', () => {
    const pending = buildEvent({
      id: 'gemini-action-pending:call-1',
      kind: 'run_execution',
      title: 'Run',
      body: '$ ls -la',
      meta: {
        agent: 'gemini',
        streamEvent: 'gemini_action_pending',
        sessionCallId: 'call-1',
      },
    });
    const persisted = buildEvent({
      id: 'db-action-1',
      kind: 'run_execution',
      title: 'Run',
      body: '$ ls -la\nfile1.txt',
      meta: {
        agent: 'gemini',
        streamEvent: 'agent_stream_action',
        sessionCallId: 'call-1',
      },
    });

    expect(collapseRealtimeGeminiPartialEvents([pending, persisted])).toEqual([persisted]);
  });

  it('skips pending action event when choosing the after cursor', () => {
    const persisted = buildEvent({
      id: 'persisted-read-1',
      kind: 'file_read',
      title: 'File Read',
      body: 'some/file.ts',
    });
    const pending = buildEvent({
      id: 'gemini-action-pending:call-2',
      kind: 'run_execution',
      title: 'Run',
      meta: {
        agent: 'gemini',
        streamEvent: 'gemini_action_pending',
        sessionCallId: 'call-2',
      },
    });

    expect(findLatestPersistedCursorEventId([persisted, pending])).toBe('persisted-read-1');
  });
});

describe('findLatestPersistedCursorEventId', () => {
  it('skips realtime-only Gemini partial events when choosing the after cursor', () => {
    const persisted = buildEvent({
      id: 'persisted-read-1',
      kind: 'file_read',
      title: 'File Read',
      body: 'services/aris-web/app/SessionDashboard.tsx',
      meta: {
        chatId: 'chat-1',
      },
    });
    const partial = buildEvent({
      id: 'gemini-partial:session:turn-1:msg-2',
      timestamp: '2026-03-14T04:00:01.000Z',
      body: '다음 파일을 읽겠습니다.',
      meta: {
        agent: 'gemini',
        streamEvent: 'agent_message_partial',
        sessionTurnId: 'turn-1',
        sessionItemId: 'msg-2',
        threadId: 'thread-1',
      },
    });

    expect(findLatestPersistedCursorEventId([persisted, partial])).toBe('persisted-read-1');
  });
});
