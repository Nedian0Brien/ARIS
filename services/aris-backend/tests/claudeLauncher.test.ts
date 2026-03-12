import { describe, expect, it, vi } from 'vitest';
import { buildClaudeCommand, runClaudeCommand } from '../src/runtime/providers/claude/claudeLauncher.js';

describe('claudeLauncher', () => {
  it('does not inject --session-id commands for generated Claude sessions', () => {
    const command = buildClaudeCommand({
      prompt: 'Reply with OK',
      approvalPolicy: 'on-request',
      model: 'claude-haiku-4-5',
      resumeTarget: { id: '11111111-2222-5333-8444-555555555555', mode: 'session-id' },
    });

    expect(command.command).toBe('claude');
    expect(command.requiresPty).toBe(false);
    expect(command.args).not.toContain('--session-id');
    expect(command.args).not.toContain('--resume');
    expect(command.retryArgsOnFailure).toBeUndefined();
  });

  it('builds --resume commands for persisted Claude session ids', () => {
    const command = buildClaudeCommand({
      prompt: 'Reply with OK',
      approvalPolicy: 'never',
      model: 'claude-sonnet-4-5',
      resumeTarget: { id: 'session-live-123', mode: 'resume' },
    });

    expect(command.args).toContain('--resume');
    expect(command.args).not.toContain('--session-id');
    expect(command.args).toContain('dontAsk');
  });

  it('retries once when Claude reports a session-in-use collision for a resume target', async () => {
    const executeCommand = vi.fn()
      .mockRejectedValueOnce(new Error('Session ID abc is already in use.'))
      .mockResolvedValueOnce({
        output: 'done',
        cwd: '/tmp',
        inferredActions: [],
        streamedActionsPersisted: false,
        threadId: 'session-live-123',
      });

    const result = await runClaudeCommand({
      prompt: 'Reply with OK',
      approvalPolicy: 'on-request',
      model: 'claude-haiku-4-5',
      resumeTarget: { id: 'session-live-123', mode: 'resume' },
      executeCommand,
    });

    expect(executeCommand).toHaveBeenCalledTimes(2);
    expect(result.output).toBe('done');
    expect(result.threadId).toBe('session-live-123');
  });

  it('strips synthetic session-id targets before executing Claude commands', async () => {
    const executeCommand = vi.fn().mockResolvedValue({
      output: 'done',
      cwd: '/tmp',
      inferredActions: [],
      streamedActionsPersisted: false,
    });

    await runClaudeCommand({
      prompt: 'Reply with OK',
      approvalPolicy: 'on-request',
      model: 'claude-haiku-4-5',
      resumeTarget: { id: '11111111-2222-5333-8444-555555555555', mode: 'session-id' },
      executeCommand,
    });

    expect(executeCommand).toHaveBeenCalledTimes(1);
    expect(executeCommand.mock.calls[0]?.[0]?.command.args).not.toContain('--session-id');
    expect(executeCommand.mock.calls[0]?.[0]?.command.args).not.toContain('--resume');
  });
});
