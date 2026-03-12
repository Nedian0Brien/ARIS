import { describe, expect, it } from 'vitest';
import {
  buildClaudeResumeTarget,
  buildClaudeSessionId,
  chooseClaudePreferredThreadId,
  resolveClaudeThreadId,
} from '../src/runtime/providers/claude/claudeSessionSource.js';

describe('claudeSessionSource', () => {
  it('uses a stored Claude thread id as the resume target', () => {
    const resolved = buildClaudeResumeTarget('session-live-123', 'session-1', 'chat-1');

    expect(resolved.resumeTarget).toEqual({ id: 'session-live-123', mode: 'resume' });
    expect(resolved.actionThreadId).toBe('session-live-123');
    expect(resolved.threadIdSource).toBe('resume');
  });

  it('keeps a deterministic synthetic action thread id without creating a Claude resume target', () => {
    const resolved = buildClaudeResumeTarget(undefined, 'session-2', 'chat-2');

    expect(resolved.resumeTarget).toBeUndefined();
    expect(resolved.actionThreadId).toBe(buildClaudeSessionId('session-2', 'chat-2'));
    expect(resolved.threadIdSource).toBe('synthetic');
  });

  it('prefers an observed Claude session id over the initial synthetic seed', () => {
    const resolved = resolveClaudeThreadId({
      observedThreadId: 'session-observed-999',
      actionThreadId: '11111111-2222-5333-8444-555555555555',
      initialSource: 'synthetic',
    });

    expect(resolved.threadId).toBe('session-observed-999');
    expect(resolved.threadIdSource).toBe('observed');
  });

  it('prefers requested, then active, then stored Claude thread ids', () => {
    expect(chooseClaudePreferredThreadId({
      requestedThreadId: 'requested-1',
      activeThreadId: 'active-1',
      storedThreadId: 'stored-1',
    })).toBe('requested-1');
    expect(chooseClaudePreferredThreadId({
      activeThreadId: 'active-1',
      storedThreadId: 'stored-1',
    })).toBe('active-1');
    expect(chooseClaudePreferredThreadId({
      storedThreadId: 'stored-1',
    })).toBe('stored-1');
  });
});
