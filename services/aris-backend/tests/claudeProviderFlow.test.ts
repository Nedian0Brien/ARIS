import { describe, expect, it, vi } from 'vitest';
import { runClaudeProviderTurn } from '../src/runtime/providers/claude/claudeOrchestrator.js';
import { ClaudeSession } from '../src/runtime/providers/claude/claudeSession.js';
import { buildClaudeSessionId } from '../src/runtime/providers/claude/claudeSessionSource.js';

describe('Claude provider flow', () => {
  it('starts a new Claude turn without injecting a synthetic session id and persists the observed Claude session id', async () => {
    const seenCommands: string[][] = [];
    const session = {
      id: 'runtime-session-1',
      metadata: {
        approvalPolicy: 'never',
        path: '/tmp/claude-provider-flow',
      },
    };
    const sessionOwner = new ClaudeSession({
      sessionId: 'runtime-session-1',
      chatId: 'chat-1',
    });

    const result = await runClaudeProviderTurn({
      session,
      sessionOwner,
      prompt: 'hello',
      chatId: 'chat-1',
      executeCommand: async ({ command }) => {
        seenCommands.push(command.args);
        return {
          output: 'hello from claude',
          cwd: '/tmp/claude-provider-flow',
          streamedActionsPersisted: false,
          inferredActions: [],
          threadId: 'observed-session-1',
        };
      },
    });

    expect(seenCommands).toHaveLength(1);
    expect(seenCommands[0]).not.toContain('--session-id');
    expect(seenCommands[0]).not.toContain('--resume');
    expect(result.actionThreadId).toBe(buildClaudeSessionId('runtime-session-1', 'chat-1'));
    expect(result.threadId).toBe('observed-session-1');
    expect(result.threadIdSource).toBe('observed');
    expect(result.messageMeta).toEqual({
      claudeSessionId: 'observed-session-1',
      threadIdSource: 'observed',
    });
    expect(sessionOwner.getActiveThreadId()).toBe('observed-session-1');
  });

  it('resumes the next Claude turn with the stored Claude session id', async () => {
    const seenCommands: string[][] = [];
    const session = {
      id: 'runtime-session-1',
      metadata: {
        approvalPolicy: 'never',
        path: '/tmp/claude-provider-flow',
      },
    };
    const sessionOwner = new ClaudeSession({
      sessionId: 'runtime-session-1',
      chatId: 'chat-1',
    });
    sessionOwner.observeThreadId('observed-session-1');

    const result = await runClaudeProviderTurn({
      session,
      sessionOwner,
      prompt: 'follow up',
      chatId: 'chat-1',
      storedThreadId: 'observed-session-1',
      executeCommand: async ({ command }) => {
        seenCommands.push(command.args);
        return {
          output: 'follow up from claude',
          cwd: '/tmp/claude-provider-flow',
          streamedActionsPersisted: false,
          inferredActions: [],
        };
      },
    });

    expect(seenCommands).toHaveLength(1);
    expect(seenCommands[0]).toContain('--resume');
    expect(seenCommands[0]).toContain('observed-session-1');
    expect(result.actionThreadId).toBe('observed-session-1');
    expect(result.threadId).toBe('observed-session-1');
    expect(result.threadIdSource).toBe('resume');
    expect(result.messageMeta).toEqual({
      claudeSessionId: 'observed-session-1',
      threadIdSource: 'resume',
    });
    expect(sessionOwner.getActiveThreadId()).toBe('observed-session-1');
  });

  it('falls back to a fresh synthetic Claude session when a stored resume id is missing', async () => {
    const seenCommands: string[][] = [];
    const onAction = vi.fn();
    const session = {
      id: 'runtime-session-2',
      metadata: {
        approvalPolicy: 'never',
        path: '/tmp/claude-provider-flow',
      },
    };
    const sessionOwner = new ClaudeSession({
      sessionId: 'runtime-session-2',
      chatId: 'chat-2',
    });
    sessionOwner.restoreThreadId('bedc95ab-adf7-5709-938a-ad61199566f8');

    const result = await runClaudeProviderTurn({
      session,
      sessionOwner,
      prompt: 'follow up',
      chatId: 'chat-2',
      storedThreadId: 'bedc95ab-adf7-5709-938a-ad61199566f8',
      onAction,
      executeCommand: async ({ command, onAction: emitAction }) => {
        seenCommands.push(command.args);
        if (seenCommands.length === 1) {
          throw new Error('No conversation found with session ID: bedc95ab-adf7-5709-938a-ad61199566f8');
        }
        await emitAction?.({
          actionType: 'command_execution',
          title: 'Run command',
          command: 'pwd',
          additions: 0,
          deletions: 0,
          hasDiffSignal: false,
        });
        return {
          output: 'fresh response',
          cwd: '/tmp/claude-provider-flow',
          streamedActionsPersisted: false,
          inferredActions: [],
        };
      },
    });

    expect(seenCommands).toHaveLength(2);
    expect(seenCommands[0]).toContain('--resume');
    expect(seenCommands[0]).toContain('bedc95ab-adf7-5709-938a-ad61199566f8');
    expect(seenCommands[1]).not.toContain('--session-id');
    expect(seenCommands[1]).not.toContain('--resume');
    expect(result.actionThreadId).toBe(buildClaudeSessionId('runtime-session-2', 'chat-2'));
    expect(result.threadId).toBe(buildClaudeSessionId('runtime-session-2', 'chat-2'));
    expect(result.threadIdSource).toBe('synthetic');
    expect(result.messageMeta).toEqual({
      threadIdSource: 'synthetic',
    });
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'command_execution',
      command: 'pwd',
    }), { threadId: buildClaudeSessionId('runtime-session-2', 'chat-2') });
    expect(sessionOwner.snapshot().sessionSource).toBe('synthetic');
  });

  it('keeps synthetic ids local-only and never injects them into a fresh Claude turn', async () => {
    const seenCommands: string[][] = [];
    const session = {
      id: 'runtime-session-4',
      metadata: {
        approvalPolicy: 'never',
        path: '/tmp/claude-provider-flow',
      },
    };
    const sessionOwner = new ClaudeSession({
      sessionId: 'runtime-session-4',
      chatId: 'chat-4',
    });

    const result = await runClaudeProviderTurn({
      session,
      sessionOwner,
      prompt: 'retry bootstrap',
      chatId: 'chat-4',
      executeCommand: async ({ command }) => {
        seenCommands.push(command.args);
        return {
          output: 'fresh response',
          cwd: '/tmp/claude-provider-flow',
          streamedActionsPersisted: false,
          inferredActions: [],
        };
      },
    });

    expect(seenCommands).toHaveLength(1);
    expect(seenCommands[0]).not.toContain('--session-id');
    expect(seenCommands[0]).not.toContain('--resume');
    expect(result.actionThreadId).toBe(buildClaudeSessionId('runtime-session-4', 'chat-4'));
    expect(result.threadId).toBe(result.actionThreadId);
    expect(result.threadIdSource).toBe('synthetic');
    expect(result.messageMeta).toEqual({
      threadIdSource: 'synthetic',
    });
  });

  it('waits for permission resolution before returning to streaming and completion', async () => {
    const seenStates: string[] = [];
    let resolveDecision!: (decision: 'allow_once') => void;
    const permissionDecision = new Promise<'allow_once'>((resolve) => {
      resolveDecision = resolve;
    });
    const session = {
      id: 'runtime-session-3',
      metadata: {
        approvalPolicy: 'on-request',
        path: '/tmp/claude-provider-flow',
      },
    };
    const sessionOwner = new ClaudeSession({
      sessionId: 'runtime-session-3',
      chatId: 'chat-3',
      callbacks: {
        onTurnStateChanged: (state) => {
          seenStates.push(state);
        },
      },
    });

    const resultPromise = runClaudeProviderTurn({
      session,
      sessionOwner,
      prompt: 'need approval',
      chatId: 'chat-3',
      onPermission: async () => permissionDecision,
      executeCommand: async ({ onPermission, onAction }) => {
        const decisionPromise = onPermission?.({
          callId: 'approval-1',
          approvalId: 'approval-1',
          command: 'npm install sharp',
          reason: 'Need approval',
          risk: 'high',
        });
        expect(sessionOwner.snapshot().turnState).toBe('waiting_permission');
        resolveDecision('allow_once');
        const decision = await decisionPromise;
        expect(decision).toBe('allow_once');
        await onAction?.({
          actionType: 'command_execution',
          title: 'Run command',
          command: 'npm install sharp',
          additions: 0,
          deletions: 0,
          hasDiffSignal: false,
        });
        return {
          output: 'approved',
          cwd: '/tmp/claude-provider-flow',
          streamedActionsPersisted: true,
          inferredActions: [],
          threadId: 'observed-session-3',
        };
      },
    });

    const result = await resultPromise;

    expect(result.threadId).toBe('observed-session-3');
    expect(seenStates).toContain('waiting_permission');
    expect(seenStates).toContain('streaming');
    expect(sessionOwner.snapshot().turnState).toBe('completed');
  });
});
