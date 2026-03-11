import { describe, expect, it } from 'vitest';
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
});
