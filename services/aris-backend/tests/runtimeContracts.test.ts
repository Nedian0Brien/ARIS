import { describe, expect, it } from 'vitest';
import { PROVIDER_RUNTIME_METHODS, type ProviderRuntime } from '../src/runtime/contracts/providerRuntime.js';
import { isSessionProtocolEnvelopeKind, SESSION_PROTOCOL_ENVELOPE_KINDS } from '../src/runtime/contracts/sessionProtocol.js';
import { ClaudeSessionController } from '../src/runtime/providers/claude/claudeSessionController.js';
import type { ClaudeRuntimeSession } from '../src/runtime/providers/claude/claudeSessionContract.js';
import {
  CLAUDE_SESSION_KEEPALIVE_STATES,
  CLAUDE_SESSION_ONE_TIME_FLAGS,
  CLAUDE_SESSION_SOURCES,
  CLAUDE_SESSION_TURN_STATES,
  type ClaudeSessionContract,
} from '../src/runtime/providers/claude/claudeSessionContract.js';

describe('runtime contracts', () => {
  it('exposes the supported provider runtime methods and session protocol envelope kinds', () => {
    expect(PROVIDER_RUNTIME_METHODS).toEqual([
      'sendTurn',
      'abortTurn',
      'recoverSession',
      'isRunning',
    ]);
    expect(SESSION_PROTOCOL_ENVELOPE_KINDS).toEqual([
      'turn-start',
      'turn-end',
      'tool-call-start',
      'tool-call-end',
      'text',
      'stop',
    ]);
    expect(isSessionProtocolEnvelopeKind('tool-call-start')).toBe(true);
    expect(isSessionProtocolEnvelopeKind('unknown')).toBe(false);
  });

  it('describes the Claude runtime session contract surface for Sprint 1', () => {
    expect(CLAUDE_SESSION_SOURCES).toEqual([
      'synthetic',
      'resume',
      'observed',
      'scanner',
      'hook',
    ]);
    expect(CLAUDE_SESSION_KEEPALIVE_STATES).toEqual([
      'active',
      'idle',
      'draining',
      'stopped',
    ]);
    expect(CLAUDE_SESSION_TURN_STATES).toEqual([
      'idle',
      'launching',
      'streaming',
      'waiting_permission',
      'completed',
      'aborted',
      'failed',
    ]);
    expect(CLAUDE_SESSION_ONE_TIME_FLAGS).toEqual([
      'synthetic-bootstrap',
      'resume-bootstrap',
      'session-start-hook',
    ]);

    const sessionContract: ClaudeSessionContract = {
      scope: {
        sessionId: 'session-1',
        chatId: 'chat-1',
      },
      launchMode: 'remote',
      keepAliveState: 'active',
      sessionSource: 'observed',
      turnState: 'streaming',
      identity: {
        syntheticId: 'synthetic-session-1',
        observedId: 'observed-session-1',
        activeThreadId: 'observed-session-1',
        sessionSource: 'observed',
        threadIdSource: 'observed',
      },
      oneTimeFlags: {
        'synthetic-bootstrap': false,
        'session-start-hook': true,
      },
      callbacks: {
        onSessionObserved: () => undefined,
        onTurnStateChanged: () => undefined,
      },
    };
    expect(sessionContract.turnState).toBe('streaming');
    expect(sessionContract.identity.sessionSource).toBe('observed');

    const runtime: ProviderRuntime<ClaudeRuntimeSession> = {
      provider: 'claude',
      async sendTurn() {
        return {
          output: 'ok',
          cwd: '/tmp',
          streamedActionsPersisted: false,
          inferredActions: [],
          threadId: 'thread-1',
          threadIdSource: 'observed',
        };
      },
      abortTurn() {
        return undefined;
      },
      recoverSession(input) {
        return {
          session: input.session,
          chatId: input.chatId,
          recoveredThreadId: input.storedThreadId,
          threadIdSource: input.storedThreadId ? 'resume' : undefined,
          source: input.storedThreadId ? 'stored' : 'none',
        };
      },
      isRunning() {
        return false;
      },
    };
    expect(runtime.provider).toBe('claude');
    expect(typeof runtime.sendTurn).toBe('function');
    expect(typeof runtime.abortTurn).toBe('function');
    expect(typeof runtime.recoverSession).toBe('function');
    expect(typeof runtime.isRunning).toBe('function');
  });

  it('tracks Claude session controller snapshots through the session lifecycle', async () => {
    const controller = new ClaudeSessionController({
      sessionId: 'session-1',
      chatId: 'chat-1',
      startedAt: 100,
      model: 'claude-sonnet-4-5',
      launchMode: 'remote',
    });

    expect(controller.snapshot()).toEqual({
      scope: {
        sessionId: 'session-1',
        chatId: 'chat-1',
      },
      startedAt: 100,
      model: 'claude-sonnet-4-5',
      launchMode: 'remote',
      status: 'running',
    });

    controller.finish();
    await controller.waitForCompletion(10);

    expect(controller.snapshot()).toEqual({
      scope: {
        sessionId: 'session-1',
        chatId: 'chat-1',
      },
      startedAt: 100,
      model: 'claude-sonnet-4-5',
      launchMode: 'remote',
      status: 'finished',
    });
  });
});
