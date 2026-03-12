import { describe, expect, it } from 'vitest';
import {
  buildGeminiResumeTarget,
  chooseGeminiPreferredThreadId,
  recoverGeminiThreadIdFromMessages,
  resolveGeminiThreadId,
} from '../src/runtime/providers/gemini/geminiSessionSource.js';

describe('geminiSessionSource', () => {
  it('uses a stored Gemini thread id as the resume target', () => {
    const resolved = buildGeminiResumeTarget('gemini-session-123');

    expect(resolved.resumeTarget).toEqual({ id: 'gemini-session-123', mode: 'resume' });
    expect(resolved.threadIdSource).toBe('resume');
  });

  it('prefers requested, then active, then stored Gemini thread ids', () => {
    expect(chooseGeminiPreferredThreadId({
      requestedThreadId: 'requested-1',
      activeThreadId: 'active-1',
      storedThreadId: 'stored-1',
    })).toBe('requested-1');
    expect(chooseGeminiPreferredThreadId({
      activeThreadId: 'active-1',
      storedThreadId: 'stored-1',
    })).toBe('active-1');
    expect(chooseGeminiPreferredThreadId({
      storedThreadId: 'stored-1',
    })).toBe('stored-1');
  });

  it('prefers observed Gemini thread ids over resume ids', () => {
    const resolved = resolveGeminiThreadId({
      observedThreadId: 'gemini-observed-1',
      resumeThreadId: 'gemini-stored-1',
    });

    expect(resolved.threadId).toBe('gemini-observed-1');
    expect(resolved.threadIdSource).toBe('observed');
  });

  it('recovers the latest Gemini thread id from matching message history', () => {
    const recovered = recoverGeminiThreadIdFromMessages([
      {
        id: 'm1',
        sessionId: 'session-1',
        type: 'text',
        title: 'older',
        text: 'ignore',
        createdAt: '2026-03-13T00:00:00.000Z',
        meta: {
          agent: 'codex',
          threadId: 'codex-thread-1',
        },
      },
      {
        id: 'm2',
        sessionId: 'session-1',
        type: 'text',
        title: 'gemini',
        text: 'keep',
        createdAt: '2026-03-13T00:00:01.000Z',
        meta: {
          agent: 'gemini',
          chatId: 'chat-1',
          geminiSessionId: 'gemini-thread-1',
        },
      },
    ], 'chat-1');

    expect(recovered).toBe('gemini-thread-1');
  });
});
