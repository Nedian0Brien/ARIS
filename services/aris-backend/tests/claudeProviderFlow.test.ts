import { describe, expect, it, vi } from 'vitest';
import { runClaudeProviderTurn } from '../src/runtime/providers/claude/claudeOrchestrator.js';
import { buildClaudeSessionId } from '../src/runtime/providers/claude/claudeSessionSource.js';

describe('Claude provider flow', () => {
  it('starts a new Claude turn with a synthetic session id but persists the observed Claude session id', async () => {
    const seenCommands: string[][] = [];
    const session = {
      id: 'runtime-session-1',
      metadata: {
        approvalPolicy: 'never',
        path: '/tmp/claude-provider-flow',
      },
    };

    const result = await runClaudeProviderTurn({
      session,
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
    expect(seenCommands[0]).toContain('--session-id');
    expect(seenCommands[0]).toContain(buildClaudeSessionId('runtime-session-1', 'chat-1'));
    expect(result.actionThreadId).toBe(buildClaudeSessionId('runtime-session-1', 'chat-1'));
    expect(result.threadId).toBe('observed-session-1');
    expect(result.threadIdSource).toBe('observed');
    expect(result.messageMeta).toEqual({
      claudeSessionId: 'observed-session-1',
      threadIdSource: 'observed',
    });
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

    const result = await runClaudeProviderTurn({
      session,
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

    const result = await runClaudeProviderTurn({
      session,
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
    expect(seenCommands[1]).toContain('--session-id');
    expect(seenCommands[1]).toContain(buildClaudeSessionId('runtime-session-2', 'chat-2'));
    expect(result.actionThreadId).toBe(buildClaudeSessionId('runtime-session-2', 'chat-2'));
    expect(result.threadId).toBe(buildClaudeSessionId('runtime-session-2', 'chat-2'));
    expect(result.threadIdSource).toBe('synthetic');
    expect(result.messageMeta).toEqual({
      claudeSessionId: buildClaudeSessionId('runtime-session-2', 'chat-2'),
      threadIdSource: 'synthetic',
    });
    expect(onAction).toHaveBeenCalledWith(expect.objectContaining({
      actionType: 'command_execution',
      command: 'pwd',
    }), { threadId: buildClaudeSessionId('runtime-session-2', 'chat-2') });
  });
});
