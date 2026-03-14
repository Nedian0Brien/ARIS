import { describe, expect, it } from 'vitest';
import { buildGeminiCommand } from '../src/runtime/providers/gemini/geminiLauncher.js';

describe('geminiLauncher', () => {
  it('does not inject provider resume flags for non-resume targets', () => {
    const command = buildGeminiCommand({
      prompt: 'Reply with OK',
      approvalPolicy: 'on-request',
      model: 'gemini-2.5-pro',
      resumeTarget: { id: 'local-correlation-123', mode: 'session-id' },
    });

    expect(command.args).not.toContain('--resume');
    expect(command.fallbackArgs).not.toContain('--resume');
    expect(command.retryArgsOnFailure).toBeUndefined();
  });

  it('uses --resume only for stored Gemini provider identities', () => {
    const command = buildGeminiCommand({
      prompt: 'Reply with OK',
      approvalPolicy: 'on-request',
      model: 'gemini-2.5-pro',
      resumeTarget: { id: 'gemini-session-123', mode: 'resume' },
    });

    expect(command.args).toContain('--resume');
    expect(command.args).toContain('gemini-session-123');
    expect(command.fallbackArgs).toContain('--resume');
    expect(command.retryArgsOnFailure).not.toContain('--resume');
  });

  it('adds yolo approval mode only when the session policy is yolo', () => {
    const command = buildGeminiCommand({
      prompt: 'Reply with OK',
      approvalPolicy: 'yolo',
      model: 'gemini-2.5-pro',
    });

    expect(command.args).toContain('--approval-mode');
    expect(command.args).toContain('yolo');
    expect(command.fallbackArgs).toContain('--approval-mode');
    expect(command.fallbackArgs).toContain('yolo');
  });
});
