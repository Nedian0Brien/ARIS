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
