import { describe, expect, it, vi } from 'vitest';
import { ClaudeSessionRegistry } from '../src/runtime/providers/claude/claudeSessionRegistry.js';

describe('ClaudeSessionRegistry', () => {
  it('replaces an existing scoped run after aborting and waiting for completion', async () => {
    const registry = new ClaudeSessionRegistry();
    const first = await registry.start({ sessionId: 'session-1', chatId: 'chat-1' }, 50);

    const secondPromise = registry.start({ sessionId: 'session-1', chatId: 'chat-1' }, 50);
    expect(first.signal.aborted).toBe(true);

    first.finish();
    const second = await secondPromise;
    expect(second).not.toBe(first);
    expect(registry.isRunning({ sessionId: 'session-1', chatId: 'chat-1' })).toBe(true);

    registry.finish(second);
    expect(registry.isRunning({ sessionId: 'session-1', chatId: 'chat-1' })).toBe(false);
  });

  it('aborts only the targeted chat run when chatId is provided', async () => {
    const registry = new ClaudeSessionRegistry();
    const first = await registry.start({ sessionId: 'session-2', chatId: 'chat-a' }, 50);
    const second = await registry.start({ sessionId: 'session-2', chatId: 'chat-b' }, 50);

    registry.abortSessionRuns({ sessionId: 'session-2', chatId: 'chat-a' });

    expect(first.signal.aborted).toBe(true);
    expect(second.signal.aborted).toBe(false);
    expect(registry.isRunning({ sessionId: 'session-2', chatId: 'chat-a' })).toBe(false);
    expect(registry.isRunning({ sessionId: 'session-2', chatId: 'chat-b' })).toBe(true);
  });

  it('cleans up stale runs and reports them through the callback', async () => {
    const registry = new ClaudeSessionRegistry();
    const stale = await registry.start({
      sessionId: 'session-3',
      chatId: 'chat-old',
      startedAt: Date.now() - 120_000,
      model: 'claude-sonnet',
    }, 50);
    const fresh = await registry.start({
      sessionId: 'session-3',
      chatId: 'chat-new',
      startedAt: Date.now(),
    }, 50);
    const onStale = vi.fn(async () => undefined);

    await registry.cleanupStaleRuns(60_000, onStale);

    expect(stale.signal.aborted).toBe(true);
    expect(fresh.signal.aborted).toBe(false);
    expect(onStale).toHaveBeenCalledTimes(1);
    expect(onStale.mock.calls[0]?.[0]).toMatchObject({
      runKey: 'session-3:chat-old',
      ageMs: expect.any(Number),
    });
    expect(registry.isRunning({ sessionId: 'session-3', chatId: 'chat-old' })).toBe(false);
    expect(registry.isRunning({ sessionId: 'session-3', chatId: 'chat-new' })).toBe(true);
  });
});
