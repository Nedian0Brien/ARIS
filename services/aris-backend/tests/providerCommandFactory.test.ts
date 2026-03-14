import { describe, expect, it } from 'vitest';
import { buildProviderCommand } from '../src/runtime/providers/providerCommandFactory.js';

describe('providerCommandFactory', () => {
  it('dispatches Claude command building to the Claude launcher without injecting session-id targets', () => {
    const command = buildProviderCommand({
      agent: 'claude',
      prompt: 'Reply with OK',
      approvalPolicy: 'on-request',
      model: 'claude-haiku-4-5',
      resumeTarget: { id: '11111111-2222-5333-8444-555555555555', mode: 'session-id' },
    });

    expect(command?.command).toBe('claude');
    expect(command?.args).not.toContain('--session-id');
    expect(command?.args).not.toContain('--resume');
  });

  it('dispatches Gemini command building to the Gemini launcher', () => {
    const command = buildProviderCommand({
      agent: 'gemini',
      prompt: 'Reply with OK',
      approvalPolicy: 'on-request',
      model: 'gemini-2.5-pro',
      resumeTarget: 'gemini-session-123',
    });

    expect(command?.command).toBe('gemini');
    expect(command?.args).toContain('--resume');
    expect(command?.fallbackArgs).toContain('-p');
  });

  it('passes yolo approval policy through to the Gemini launcher', () => {
    const command = buildProviderCommand({
      agent: 'gemini',
      prompt: 'Reply with OK',
      approvalPolicy: 'yolo',
      model: 'gemini-2.5-pro',
    });

    expect(command?.command).toBe('gemini');
    expect(command?.args).toContain('--approval-mode');
    expect(command?.args).toContain('yolo');
  });

  it('does not pass local Gemini correlation ids through provider resume flags', () => {
    const command = buildProviderCommand({
      agent: 'gemini',
      prompt: 'Reply with OK',
      approvalPolicy: 'on-request',
      model: 'gemini-2.5-pro',
      resumeTarget: { id: 'local-correlation-123', mode: 'session-id' },
    });

    expect(command?.command).toBe('gemini');
    expect(command?.args).not.toContain('--resume');
    expect(command?.fallbackArgs).not.toContain('--resume');
  });
});
