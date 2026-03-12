import { describe, expect, it } from 'vitest';
import { projectClaudeTextMessage, projectClaudeToolActionMessage } from '../src/runtime/providers/claude/claudeEventBridge.js';
import type { SessionProtocolEnvelope } from '../src/runtime/contracts/sessionProtocol.js';

describe('claudeEventBridge', () => {
  it('projects Claude tool actions into persisted tool messages', () => {
    const envelopes: SessionProtocolEnvelope[] = [
      {
        kind: 'tool-call-end',
        provider: 'claude',
        source: 'tool',
        sessionId: 'claude-session-1',
        turnId: 'claude-session-1',
        toolCallId: 'call-1',
        toolName: 'command_execution',
        stopReason: 'completed',
      },
    ];

    const projection = projectClaudeToolActionMessage({
      action: {
        actionType: 'command_execution',
        title: 'Run command',
        callId: 'call-1',
        command: 'pwd',
        output: '/workspace',
        additions: 0,
        deletions: 0,
        hasDiffSignal: false,
      },
      actionIndex: 0,
      requestedPath: '/workspace/project',
      execCwd: '/workspace/project',
      model: 'claude-sonnet-4-5',
      threadId: 'claude-session-1',
      envelopes,
    });

    expect(projection?.body).toContain('$ pwd');
    expect(projection?.meta.sessionEventType).toBe('tool-call-end');
    expect(projection?.options?.type).toBe('tool');
  });

  it('projects Claude text envelopes into persisted text messages', () => {
    const envelopes: SessionProtocolEnvelope[] = [
      {
        kind: 'text',
        provider: 'claude',
        source: 'assistant',
        sessionId: 'claude-session-2',
        turnId: 'claude-session-2',
        text: '응답 완료',
      },
      {
        kind: 'turn-end',
        provider: 'claude',
        source: 'result',
        sessionId: 'claude-session-2',
        turnId: 'claude-session-2',
        threadId: 'claude-session-2',
        threadIdSource: 'observed',
        stopReason: 'completed',
      },
    ];

    const projection = projectClaudeTextMessage({
      output: '응답 완료',
      requestedPath: '/workspace/project',
      execCwd: '/workspace/project',
      model: 'claude-sonnet-4-5',
      threadId: 'claude-session-2',
      messageMeta: {
        claudeSessionId: 'claude-session-2',
        threadIdSource: 'observed',
      },
      envelopes,
    });

    expect(projection?.body).toBe('응답 완료');
    expect(projection?.meta.sessionEventType).toBe('text');
    expect(projection?.meta.sessionTurnStatus).toBe('completed');
    expect(projection?.meta.claudeSessionId).toBe('claude-session-2');
  });
});
