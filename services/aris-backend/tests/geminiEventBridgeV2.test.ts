import { describe, expect, it } from 'vitest';
import { buildGeminiProviderTextEvent, mapGeminiCanonicalEventsToProtocol } from '../src/runtime/providers/gemini/geminiEventBridgeV2.js';
import type { GeminiCanonicalEvent } from '../src/runtime/providers/gemini/geminiCanonicalEvents.js';

describe('geminiEventBridgeV2', () => {
  it('maps canonical Gemini events into protocol envelopes without collapsing commentary and final text', () => {
    const events: GeminiCanonicalEvent[] = [
      {
        type: 'turn_started',
        threadId: 'gemini-thread',
        turnId: 'turn-1',
        rawLine: '{"type":"system"}',
      },
      {
        type: 'text_completed',
        threadId: 'gemini-thread',
        turnId: 'turn-1',
        itemId: 'msg-commentary',
        phase: 'commentary',
        source: 'assistant',
        text: '먼저 구조를 확인하겠습니다.',
        rawLine: '{"method":"item/completed"}',
      },
      {
        type: 'text_completed',
        threadId: 'gemini-thread',
        turnId: 'turn-1',
        itemId: 'msg-final',
        phase: 'final_answer',
        source: 'assistant',
        text: '수정을 마쳤습니다.',
        rawLine: '{"method":"item/completed"}',
      },
      {
        type: 'turn_completed',
        threadId: 'gemini-thread',
        turnId: 'turn-1',
        stopReason: 'completed',
        rawLine: '{"type":"result"}',
      },
    ];

    expect(mapGeminiCanonicalEventsToProtocol(events).map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'text',
      'text',
      'turn-end',
      'stop',
    ]);
  });

  it('builds partial and completed provider text events from canonical Gemini events', () => {
    expect(buildGeminiProviderTextEvent({
      type: 'text_delta',
      threadId: 'gemini-thread',
      turnId: 'turn-2',
      itemId: 'msg-1',
      source: 'assistant',
      text: '실시간 ',
      rawLine: '{"method":"item/agentMessage/delta"}',
    })).toMatchObject({
      text: '실시간 ',
      partial: true,
      threadId: 'gemini-thread',
      turnId: 'turn-2',
      itemId: 'msg-1',
    });

    expect(buildGeminiProviderTextEvent({
      type: 'text_completed',
      threadId: 'gemini-thread',
      turnId: 'turn-2',
      itemId: 'msg-1',
      source: 'assistant',
      text: '실시간 완료',
      rawLine: '{"method":"item/completed"}',
    })).toMatchObject({
      text: '실시간 완료',
      threadId: 'gemini-thread',
      turnId: 'turn-2',
      itemId: 'msg-1',
      envelopes: [
        expect.objectContaining({
          kind: 'text',
          text: '실시간 완료',
        }),
      ],
    });
  });
});
