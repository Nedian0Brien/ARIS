import { describe, expect, it, vi } from 'vitest';
import { RuntimeStore } from '../src/store.js';

function buildRuntimeStore(input: {
  delegate: Record<string, unknown>;
  runtimeExecutor?: Record<string, unknown> | null;
}) {
  const store = Object.create(RuntimeStore.prototype) as RuntimeStore & {
    delegate: Record<string, unknown>;
    runtimeExecutor: Record<string, unknown> | null;
  };
  store.delegate = input.delegate;
  store.runtimeExecutor = input.runtimeExecutor ?? null;
  return store;
}

describe('RuntimeStore.isSessionRunning', () => {
  it('falls back to persisted state when the in-memory executor lost the active run', async () => {
    const delegate = {
      isSessionRunning: vi.fn().mockResolvedValue(true),
    };
    const runtimeExecutor = {
      isSessionRunning: vi.fn().mockResolvedValue(false),
    };
    const store = buildRuntimeStore({ delegate, runtimeExecutor });

    await expect(store.isSessionRunning('session-1', 'chat-1')).resolves.toBe(true);
    expect(runtimeExecutor.isSessionRunning).toHaveBeenCalledWith('session-1', 'chat-1');
    expect(delegate.isSessionRunning).toHaveBeenCalledWith('session-1', 'chat-1');
  });
});

describe('RuntimeStore.applySessionAction', () => {
  it('replays the latest persisted chat user message when retry is requested', async () => {
    const delegate = {
      applySessionAction: vi.fn().mockResolvedValue({
        accepted: true,
        message: 'RETRY acknowledged',
        at: '2026-04-14T00:00:00.000Z',
      }),
      getLatestUserMessageForAction: vi.fn().mockResolvedValue({
        type: 'message',
        title: 'User Instruction',
        text: 'please continue',
        meta: {
          role: 'user',
          chatId: 'chat-1',
          agent: 'codex',
        },
      }),
    };
    const runtimeExecutor = {
      applySessionAction: vi.fn().mockResolvedValue({
        accepted: true,
        message: 'RETRY acknowledged',
        at: '2026-04-14T00:00:00.000Z',
      }),
      triggerPersistedUserMessage: vi.fn().mockResolvedValue(undefined),
    };
    const store = buildRuntimeStore({ delegate, runtimeExecutor });

    await expect(store.applySessionAction('session-1', 'retry', 'chat-1')).resolves.toMatchObject({
      accepted: true,
    });

    expect(delegate.getLatestUserMessageForAction).toHaveBeenCalledWith('session-1', 'chat-1');
    expect(runtimeExecutor.triggerPersistedUserMessage).toHaveBeenCalledWith('session-1', {
      type: 'message',
      title: 'User Instruction',
      text: 'please continue',
      meta: {
        role: 'user',
        chatId: 'chat-1',
        agent: 'codex',
      },
    });
  });
});
