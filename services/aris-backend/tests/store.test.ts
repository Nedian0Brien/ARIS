import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/runtime/worktreeManager.js', async () => {
  const actual = await vi.importActual<typeof import('../src/runtime/worktreeManager.js')>(
    '../src/runtime/worktreeManager.js',
  );
  return {
    ...actual,
    ensureWorktree: vi.fn().mockResolvedValue('/projects/app/.worktrees/parallel/panel-one'),
  };
});

import { RuntimeStore } from '../src/store.js';
import { ensureWorktree } from '../src/runtime/worktreeManager.js';

function buildRuntimeStore(input: {
  delegate: Record<string, unknown>;
  runtimeExecutor?: Record<string, unknown> | null;
}) {
  const store = Object.create(RuntimeStore.prototype) as RuntimeStore & {
    delegate: Record<string, unknown>;
    runtimeExecutor: Record<string, unknown> | null;
    realtimeSubscribers: Set<(event: unknown) => void>;
  };
  store.delegate = input.delegate;
  store.runtimeExecutor = input.runtimeExecutor ?? null;
  store.realtimeSubscribers = new Set();
  return store;
}

beforeEach(() => {
  vi.mocked(ensureWorktree).mockReset();
  vi.mocked(ensureWorktree).mockResolvedValue('/projects/app/.worktrees/parallel/panel-one');
});

describe('RuntimeStore.createSession', () => {
  it('ensures a branch worktree before persisting the session', async () => {
    const delegate = {
      createSession: vi.fn().mockResolvedValue({
        id: 'session-1',
        metadata: {
          flavor: 'codex',
          path: '/projects/app',
          branch: 'parallel/panel-one',
          approvalPolicy: 'on-request',
          runtimeModel: 'chat-stream',
        },
        state: { status: 'idle' },
        updatedAt: '2026-05-12T00:00:00.000Z',
        riskScore: 20,
      }),
    };
    const store = buildRuntimeStore({ delegate });

    await expect(store.createSession({
      path: '/projects/app',
      branch: 'parallel/panel-one',
      flavor: 'codex',
    })).resolves.toMatchObject({
      id: 'session-1',
      metadata: {
        branch: 'parallel/panel-one',
      },
    });

    expect(ensureWorktree).toHaveBeenCalledWith('/projects/app', 'parallel/panel-one');
    expect(vi.mocked(ensureWorktree).mock.invocationCallOrder[0]).toBeLessThan(
      delegate.createSession.mock.invocationCallOrder[0] ?? Number.POSITIVE_INFINITY,
    );
  });

  it('does not persist a branch session when worktree creation fails', async () => {
    vi.mocked(ensureWorktree).mockRejectedValue(new Error('WORKTREE_CREATE_FAILED: boom'));
    const delegate = {
      createSession: vi.fn(),
    };
    const store = buildRuntimeStore({ delegate });

    await expect(store.createSession({
      path: '/projects/app',
      branch: 'parallel/fails',
      flavor: 'codex',
    })).rejects.toThrow('WORKTREE_CREATE_FAILED: boom');

    expect(delegate.createSession).not.toHaveBeenCalled();
  });
});

describe('RuntimeStore.resolveExecutionCwd', () => {
  it('applies branch worktree resolution after delegate path resolution', () => {
    const delegate = {
      resolveExecutionCwd: vi.fn().mockReturnValue('/host/project/ARIS'),
    };
    const store = buildRuntimeStore({ delegate });

    expect(store.resolveExecutionCwd('/workspace/ARIS', 'parallel/panel-one')).toBe(
      '/host/project/ARIS/.worktrees/parallel/panel-one',
    );
    expect(delegate.resolveExecutionCwd).toHaveBeenCalledWith('/workspace/ARIS');
  });
});

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
  it('broadcasts appended chat events immediately to realtime channel subscribers', async () => {
    const event = {
      id: 'event-1',
      sessionId: 'session-1',
      type: 'message',
      title: 'User Instruction',
      text: 'continue',
      createdAt: '2026-05-10T00:00:00.000Z',
      meta: {
        role: 'user',
        chatId: 'chat-1',
      },
    };
    const delegate = {
      appendChatEvent: vi.fn().mockResolvedValue(event),
    };
    const store = buildRuntimeStore({ delegate });
    const listener = vi.fn();

    store.subscribeRealtimeChannel({ sessionId: 'session-1', chatId: 'chat-1' }, listener);
    await store.appendChatEvent('chat-1', {
      sessionId: 'session-1',
      type: 'message',
      title: 'User Instruction',
      text: 'continue',
      meta: {
        role: 'user',
        chatId: 'chat-1',
      },
    });

    expect(listener).toHaveBeenCalledWith({
      type: 'event.appended',
      sessionId: 'session-1',
      chatId: 'chat-1',
      event,
      source: 'mutation',
    });
  });

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

describe('RuntimeStore.subscribeRealtimeChannel', () => {
  it('keeps runtime fanout broad when chat subscribers include unassigned events', () => {
    const runtimeUnsubscribe = vi.fn();
    const runtimeExecutor = {
      subscribeRealtimeEvents: vi.fn((_sessionId: string, _options: object, listener: (record: unknown) => void) => {
        listener({
          cursor: 1,
          event: {
            id: 'event-unassigned',
            sessionId: 'session-1',
            type: 'tool',
            title: 'Unassigned',
            text: 'workspace update',
            createdAt: '2026-05-10T00:00:00.000Z',
            meta: {},
          },
        });
        listener({
          cursor: 2,
          event: {
            id: 'event-chat-1',
            sessionId: 'session-1',
            type: 'message',
            title: 'Chat',
            text: 'chat update',
            createdAt: '2026-05-10T00:00:01.000Z',
            meta: { chatId: 'chat-1' },
          },
        });
        listener({
          cursor: 3,
          event: {
            id: 'event-chat-2',
            sessionId: 'session-1',
            type: 'message',
            title: 'Other chat',
            text: 'other update',
            createdAt: '2026-05-10T00:00:02.000Z',
            meta: { chatId: 'chat-2' },
          },
        });
        return runtimeUnsubscribe;
      }),
    };
    const store = buildRuntimeStore({ delegate: {}, runtimeExecutor });
    const listener = vi.fn();

    const unsubscribe = store.subscribeRealtimeChannel({
      sessionId: 'session-1',
      chatId: 'chat-1',
      includeUnassigned: true,
    }, listener);

    expect(runtimeExecutor.subscribeRealtimeEvents).toHaveBeenCalledWith('session-1', {}, expect.any(Function));
    expect(listener).toHaveBeenCalledTimes(2);
    expect(listener.mock.calls.map(([event]) => (event as { event: { id: string } }).event.id)).toEqual([
      'event-unassigned',
      'event-chat-1',
    ]);

    unsubscribe();
    expect(runtimeUnsubscribe).toHaveBeenCalled();
  });
});

describe('RuntimeStore.decidePermission', () => {
  it('broadcasts permission updates to realtime channel subscribers', async () => {
    const updatedPermission = {
      id: 'perm-1',
      sessionId: 'session-1',
      chatId: 'chat-1',
      agent: 'codex',
      command: 'curl -I https://example.com',
      reason: 'network approval',
      risk: 'medium',
      state: 'approved',
      decision: 'allow_once',
      requestedAt: '2026-05-10T00:00:00.000Z',
    };
    const runtimeExecutor = {
      decidePermission: vi.fn().mockResolvedValue(updatedPermission),
      isSessionRunning: vi.fn().mockResolvedValue(true),
      triggerPersistedUserMessage: vi.fn(),
    };
    const store = buildRuntimeStore({ delegate: {}, runtimeExecutor });
    const listener = vi.fn();

    store.subscribeRealtimeChannel({ sessionId: 'session-1', chatId: 'chat-1' }, listener);
    await store.decidePermission('perm-1', 'allow_once');

    expect(listener).toHaveBeenCalledWith({
      type: 'permission.updated',
      sessionId: 'session-1',
      chatId: 'chat-1',
      permission: updatedPermission,
    });
  });

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
