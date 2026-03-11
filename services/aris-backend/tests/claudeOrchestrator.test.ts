import { describe, expect, it } from 'vitest';
import { buildClaudeActionThreadId, recoverClaudeThreadIdFromMessages } from '../src/runtime/providers/claude/claudeOrchestrator.js';

describe('claudeOrchestrator', () => {
  it('recovers the last observed Claude session id from message history', () => {
    const threadId = recoverClaudeThreadIdFromMessages([
      { meta: { agent: 'claude', threadId: 'synthetic-1', threadIdSource: 'synthetic' } },
      { meta: { agent: 'claude', claudeSessionId: 'session-live-123', threadIdSource: 'observed' } },
    ]);

    expect(threadId).toBe('session-live-123');
  });

  it('scopes recovered Claude thread ids by chat id', () => {
    const threadId = recoverClaudeThreadIdFromMessages([
      { meta: { agent: 'claude', chatId: 'chat-a', claudeSessionId: 'session-a' } },
      { meta: { agent: 'claude', chatId: 'chat-b', claudeSessionId: 'session-b' } },
    ], 'chat-b');

    expect(threadId).toBe('session-b');
  });

  it('builds a synthetic action thread id only when no requested or stored thread exists', () => {
    expect(buildClaudeActionThreadId('requested-1', 'stored-1', 'session-1', 'chat-1')).toBe('requested-1');
    expect(buildClaudeActionThreadId(undefined, 'stored-1', 'session-1', 'chat-1')).toBe('stored-1');
    expect(buildClaudeActionThreadId(undefined, undefined, 'session-1', 'chat-1')).toMatch(/^[0-9a-f-]{36}$/i);
  });
});
