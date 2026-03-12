import { describe, expect, it } from 'vitest';
import { ClaudeSession } from '../src/runtime/providers/claude/claudeSession.js';

describe('ClaudeSession', () => {
  it('tracks observed thread ids and clears them back to synthetic bootstrap state', () => {
    const session = new ClaudeSession({
      sessionId: 'session-1',
      chatId: 'chat-1',
    });

    expect(session.snapshot().sessionSource).toBe('synthetic');
    expect(session.snapshot().identity.syntheticId).toMatch(/^[0-9a-f-]{36}$/i);

    session.restoreThreadId('resume-thread-1');
    expect(session.getActiveThreadId()).toBe('resume-thread-1');
    expect(session.snapshot().sessionSource).toBe('resume');

    session.observeThreadId('observed-thread-1');
    expect(session.getActiveThreadId()).toBe('observed-thread-1');
    expect(session.snapshot().identity.observedId).toBe('observed-thread-1');
    expect(session.snapshot().sessionSource).toBe('observed');

    session.clearActiveThread();
    expect(session.getActiveThreadId()).toBeUndefined();
    expect(session.snapshot().sessionSource).toBe('synthetic');
  });

  it('consumes one-time flags only once and tracks turn state transitions', () => {
    const session = new ClaudeSession({
      sessionId: 'session-2',
    });

    expect(session.consumeOneTimeFlag('synthetic-bootstrap')).toBe(true);
    expect(session.consumeOneTimeFlag('synthetic-bootstrap')).toBe(false);

    session.beginTurn();
    expect(session.snapshot().turnState).toBe('launching');
    expect(session.snapshot().keepAliveState).toBe('active');

    session.markTurnState('streaming');
    expect(session.snapshot().turnState).toBe('streaming');

    session.abortTurn();
    expect(session.snapshot().turnState).toBe('aborted');
    expect(session.snapshot().keepAliveState).toBe('draining');
  });
});
