import { describe, expect, it, vi } from 'vitest';
import { RealtimeEventBus } from '../src/runtime/orchestration/realtimeEventBus.js';
import type { RuntimeMessage, RuntimeSession } from '../src/types.js';

function buildSession(id = 'session-1'): RuntimeSession {
  return {
    id,
    metadata: {
      flavor: 'codex',
      path: '/workspace',
      approvalPolicy: 'on-request',
    },
    state: { status: 'running' },
    updatedAt: '2026-05-10T00:00:00.000Z',
    riskScore: 20,
  };
}

function buildEvent(overrides: Partial<RuntimeMessage> = {}): RuntimeMessage {
  return {
    id: overrides.id ?? 'event-1',
    sessionId: overrides.sessionId ?? 'session-1',
    type: overrides.type ?? 'message',
    title: overrides.title ?? 'Text Reply',
    text: overrides.text ?? 'hello',
    createdAt: overrides.createdAt ?? '2026-05-10T00:00:01.000Z',
    meta: {
      chatId: 'chat-1',
      ...(overrides.meta ?? {}),
    },
  };
}

describe('RealtimeEventBus subscriptions', () => {
  it('pushes appended events to active session subscribers with the cursor', () => {
    const bus = new RealtimeEventBus({
      getSession: vi.fn().mockResolvedValue(buildSession()),
    });
    const listener = vi.fn();

    bus.subscribe('session-1', {}, listener);
    const event = buildEvent();
    bus.append('session-1', event);

    expect(listener).toHaveBeenCalledWith({
      cursor: 1,
      event,
    });
  });

  it('filters subscriber events by chatId and stops after unsubscribe', () => {
    const bus = new RealtimeEventBus({
      getSession: vi.fn().mockResolvedValue(buildSession()),
    });
    const listener = vi.fn();

    const unsubscribe = bus.subscribe('session-1', { chatId: 'chat-1' }, listener);
    bus.append('session-1', buildEvent({ id: 'other', meta: { chatId: 'chat-2' } }));
    bus.append('session-1', buildEvent({ id: 'match', meta: { chatId: 'chat-1' } }));
    unsubscribe();
    bus.append('session-1', buildEvent({ id: 'after-unsubscribe', meta: { chatId: 'chat-1' } }));

    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]?.[0].event.id).toBe('match');
  });
});
