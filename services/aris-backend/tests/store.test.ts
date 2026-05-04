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

describe('RuntimeStore.appendChatEvent', () => {
  it('does not wake an agent turn for terminal-authored command events', async () => {
    const delegate = {
      appendChatEvent: vi.fn().mockResolvedValue({
        id: 'event-1',
        sessionId: 'session-1',
        type: 'tool',
        title: 'Terminal completed',
        text: '$ pwd\n/home/ubuntu/project/ARIS',
        meta: {
          role: 'terminal',
          chatId: 'chat-1',
          command: 'pwd',
        },
      }),
    };
    const runtimeExecutor = {
      triggerPersistedUserMessage: vi.fn().mockResolvedValue(undefined),
    };
    const store = buildRuntimeStore({ delegate, runtimeExecutor });

    await store.appendChatEvent('chat-1', {
      sessionId: 'session-1',
      type: 'tool',
      title: 'Terminal completed',
      text: '$ pwd\n/home/ubuntu/project/ARIS',
      meta: {
        role: 'terminal',
        chatId: 'chat-1',
        command: 'pwd',
      },
    });

    expect(runtimeExecutor.triggerPersistedUserMessage).not.toHaveBeenCalled();
  });

  it('does not wake an agent turn for persisted user chat messages', async () => {
    const delegate = {
      appendChatEvent: vi.fn().mockResolvedValue({
        id: 'event-1',
        sessionId: 'session-1',
        type: 'message',
        title: 'User Instruction',
        text: 'continue',
        meta: {
          role: 'user',
          chatId: 'chat-1',
          agent: 'codex',
        },
      }),
    };
    const runtimeExecutor = {
      triggerPersistedUserMessage: vi.fn().mockResolvedValue(undefined),
    };
    const store = buildRuntimeStore({ delegate, runtimeExecutor });

    await store.appendChatEvent('chat-1', {
      sessionId: 'session-1',
      type: 'message',
      title: 'User Instruction',
      text: 'continue',
      meta: {
        role: 'user',
        chatId: 'chat-1',
        agent: 'codex',
      },
    });

    expect(runtimeExecutor.triggerPersistedUserMessage).not.toHaveBeenCalled();
  });
});

describe('RuntimeStore.submitChatUserPrompt', () => {
  it('persists the user prompt and explicitly wakes the agent turn', async () => {
    const delegate = {
      appendChatEvent: vi.fn().mockResolvedValue({
        id: 'event-1',
        sessionId: 'session-1',
        type: 'message',
        title: 'User Instruction',
        text: 'continue',
        meta: {
          role: 'user',
          chatId: 'chat-1',
          agent: 'codex',
        },
      }),
    };
    const runtimeExecutor = {
      triggerPersistedUserMessage: vi.fn().mockResolvedValue(undefined),
    };
    const store = buildRuntimeStore({ delegate, runtimeExecutor });

    await store.submitChatUserPrompt('chat-1', {
      sessionId: 'session-1',
      type: 'message',
      title: 'User Instruction',
      text: 'continue',
      meta: {
        actor: 'user',
        role: 'user',
        kind: 'user_message',
        chatId: 'chat-1',
        agent: 'codex',
      },
    });

    expect(delegate.appendChatEvent).toHaveBeenCalledWith('chat-1', {
      sessionId: 'session-1',
      type: 'message',
      title: 'User Instruction',
      text: 'continue',
      meta: {
        actor: 'user',
        kind: 'user_message',
        role: 'user',
        chatId: 'chat-1',
        agent: 'codex',
      },
    });
    expect(runtimeExecutor.triggerPersistedUserMessage).toHaveBeenCalledWith('session-1', {
      type: 'message',
      title: 'User Instruction',
      text: 'continue',
      meta: {
        actor: 'user',
        kind: 'user_message',
        role: 'user',
        chatId: 'chat-1',
        agent: 'codex',
      },
    });
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

describe('RuntimeStore.decidePermission', () => {
  it('replays the latest persisted user message when approval is granted after the active run is gone', async () => {
    const delegate = {
      getLatestUserMessageForAction: vi.fn().mockResolvedValue({
        type: 'message',
        title: 'User Instruction',
        text: 'retry the network request',
        meta: {
          role: 'user',
          chatId: 'chat-1',
          agent: 'codex',
        },
      }),
    };
    const runtimeExecutor = {
      decidePermission: vi.fn().mockResolvedValue({
        id: 'perm-1',
        sessionId: 'session-1',
        chatId: 'chat-1',
        agent: 'codex',
        command: 'curl -I https://example.com',
        reason: 'network approval',
        risk: 'medium',
        state: 'approved',
        decision: 'allow_once',
        requestedAt: '2026-04-14T00:00:00.000Z',
      }),
      isSessionRunning: vi.fn().mockResolvedValue(false),
      triggerPersistedUserMessage: vi.fn().mockResolvedValue(undefined),
    };
    const store = buildRuntimeStore({ delegate, runtimeExecutor });

    await expect(store.decidePermission('perm-1', 'allow_once')).resolves.toMatchObject({
      id: 'perm-1',
      state: 'approved',
    });

    expect(runtimeExecutor.isSessionRunning).toHaveBeenCalledWith('session-1', 'chat-1');
    expect(delegate.getLatestUserMessageForAction).toHaveBeenCalledWith('session-1', 'chat-1');
    expect(runtimeExecutor.triggerPersistedUserMessage).toHaveBeenCalledWith('session-1', {
      type: 'message',
      title: 'User Instruction',
      text: 'retry the network request',
      meta: {
        role: 'user',
        chatId: 'chat-1',
        agent: 'codex',
      },
    });
  });

  it('does not replay a user message when the approved run is still active in memory', async () => {
    const delegate = {
      getLatestUserMessageForAction: vi.fn(),
    };
    const runtimeExecutor = {
      decidePermission: vi.fn().mockResolvedValue({
        id: 'perm-1',
        sessionId: 'session-1',
        chatId: 'chat-1',
        agent: 'codex',
        command: 'curl -I https://example.com',
        reason: 'network approval',
        risk: 'medium',
        state: 'approved',
        decision: 'allow_once',
        requestedAt: '2026-04-14T00:00:00.000Z',
      }),
      isSessionRunning: vi.fn().mockResolvedValue(true),
      triggerPersistedUserMessage: vi.fn(),
    };
    const store = buildRuntimeStore({ delegate, runtimeExecutor });

    await store.decidePermission('perm-1', 'allow_once');

    expect(delegate.getLatestUserMessageForAction).not.toHaveBeenCalled();
    expect(runtimeExecutor.triggerPersistedUserMessage).not.toHaveBeenCalled();
  });
});
