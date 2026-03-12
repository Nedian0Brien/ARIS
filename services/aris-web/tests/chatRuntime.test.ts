import { describe, expect, it } from 'vitest';
import {
  getLatestAgentEventTimestampSince,
  getLatestRunStatusSince,
  hasAgentCompletionSignal,
  hasFinalAgentReplySince,
  isRunLifecycleEvent,
  isFinalAgentReplyEvent,
  readUiEventStreamEvent,
  resolveChatRunPhase,
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

  it('tracks the latest agent activity after the await timestamp', () => {
    const events = [
      buildEvent({
        id: 'user-1',
        timestamp: '2026-03-10T01:59:59.000Z',
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
      buildEvent({
        id: 'tool-1',
        timestamp: '2026-03-10T02:00:05.000Z',
        kind: 'command_execution',
        meta: {
          streamEvent: 'command_execution',
          role: 'agent',
        },
      }),
    ];

    expect(getLatestAgentEventTimestampSince(events, '2026-03-10T02:00:00.000Z')).toBe('2026-03-10T02:00:05.000Z');
  });

  it('returns null when there is no agent activity after the await timestamp', () => {
    const events = [
      buildEvent({
        id: 'user-1',
        timestamp: '2026-03-10T01:59:59.000Z',
        meta: { role: 'user' },
      }),
    ];

    expect(getLatestAgentEventTimestampSince(events, '2026-03-10T02:00:00.000Z')).toBeNull();
  });

  it('recognizes hidden run lifecycle events', () => {
    const event = buildEvent({
      meta: {
        streamEvent: 'run_status',
        runStatus: 'run_started',
        role: 'agent',
      },
    });

    expect(isRunLifecycleEvent(event)).toBe(true);
  });

  it('tracks the latest explicit run status after the await timestamp', () => {
    const events = [
      buildEvent({
        id: 'status-1',
        timestamp: '2026-03-10T02:00:01.000Z',
        meta: {
          streamEvent: 'run_status',
          runStatus: 'run_started',
          role: 'agent',
        },
      }),
      buildEvent({
        id: 'status-2',
        timestamp: '2026-03-10T02:00:05.000Z',
        meta: {
          streamEvent: 'run_status',
          runStatus: 'waiting_for_approval',
          role: 'agent',
        },
      }),
    ];

    expect(getLatestRunStatusSince(events, '2026-03-10T02:00:00.000Z')).toBe('waiting_for_approval');
  });

  it('keeps the run phase active while runtime is still running after completion signal', () => {
    expect(resolveChatRunPhase({
      isSubmitting: false,
      isAwaitingReply: true,
      isAborting: false,
      hasCompletionSignal: true,
      runtimeRunning: true,
    })).toBe('running');
  });

  it('falls back to idle once runtime stops after completion signal', () => {
    expect(resolveChatRunPhase({
      isSubmitting: false,
      isAwaitingReply: true,
      isAborting: false,
      hasCompletionSignal: true,
      runtimeRunning: false,
    })).toBe('idle');
  });

  it('keeps the run phase active from an explicit run_started status even without runtime polling', () => {
    expect(resolveChatRunPhase({
      isSubmitting: false,
      isAwaitingReply: true,
      isAborting: false,
      hasCompletionSignal: false,
      runtimeRunning: false,
      runStatus: 'run_started',
    })).toBe('running');
  });

  it('surfaces approval phase while waiting for a permission decision', () => {
    expect(resolveChatRunPhase({
      isSubmitting: false,
      isAwaitingReply: true,
      isAborting: false,
      hasCompletionSignal: false,
      runtimeRunning: false,
      runStatus: 'waiting_for_approval',
      hasPendingPermission: true,
    })).toBe('approval');
  });
});
