import { describe, expect, it } from 'vitest';
import {
  hasAgentCompletionSignal,
  hasFinalAgentReplySince,
  isFinalAgentReplyEvent,
  readUiEventStreamEvent,
} from '@/lib/happy/chatRuntime';
import type { UiEvent } from '@/lib/happy/types';

function buildEvent(overrides: Partial<UiEvent> = {}): UiEvent {
  return {
    id: overrides.id ?? 'event-1',
    timestamp: overrides.timestamp ?? '2026-03-10T02:00:00.000Z',
    kind: overrides.kind ?? 'text_reply',
    title: overrides.title ?? 'Text Reply',
    body: overrides.body ?? 'done',
    ...(overrides.meta ? { meta: overrides.meta } : {}),
    ...(overrides.action ? { action: overrides.action } : {}),
    ...(overrides.result ? { result: overrides.result } : {}),
    ...(overrides.parsed ? { parsed: overrides.parsed } : {}),
    ...(overrides.severity ? { severity: overrides.severity } : {}),
  };
}

describe('chatRuntime helpers', () => {
  it('reads normalized stream event values', () => {
    const event = buildEvent({ meta: { streamEvent: ' Agent_Message ' } });
    expect(readUiEventStreamEvent(event)).toBe('agent_message');
  });

  it('treats turn completion metadata as a completion signal', () => {
    const event = buildEvent({
      meta: {
        sessionTurnStatus: 'completed',
        role: 'agent',
      },
    });

    expect(hasAgentCompletionSignal(event)).toBe(true);
  });

  it('recognizes persisted final agent replies', () => {
    const event = buildEvent({
      meta: {
        streamEvent: 'agent_message',
        role: 'agent',
      },
    });

    expect(isFinalAgentReplyEvent(event)).toBe(true);
  });

  it('detects a final agent reply after the current await timestamp', () => {
    const events = [
      buildEvent({
        id: 'user-1',
        timestamp: '2026-03-10T01:59:59.000Z',
        title: 'User Instruction',
        body: 'hi',
        meta: { role: 'user' },
      }),
      buildEvent({
        id: 'agent-1',
        timestamp: '2026-03-10T02:00:01.000Z',
        meta: {
          streamEvent: 'agent_message',
          role: 'agent',
        },
      }),
    ];

    expect(hasFinalAgentReplySince(events, '2026-03-10T02:00:00.000Z')).toBe(true);
  });

  it('ignores tool events when checking for final agent replies', () => {
    const events = [
      buildEvent({
        id: 'tool-1',
        timestamp: '2026-03-10T02:00:01.000Z',
        kind: 'file_write',
        title: 'File Write',
        body: 'updated app.tsx',
        meta: {
          streamEvent: 'file_change',
          role: 'agent',
        },
      }),
    ];

    expect(hasFinalAgentReplySince(events, '2026-03-10T02:00:00.000Z')).toBe(false);
  });
});
