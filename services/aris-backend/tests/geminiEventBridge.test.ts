import { describe, expect, it } from 'vitest';
import { projectGeminiTextMessage, projectGeminiToolActionMessage } from '../src/runtime/providers/gemini/geminiEventBridge.js';
import type { SessionProtocolEnvelope } from '../src/runtime/contracts/sessionProtocol.js';

describe('geminiEventBridge', () => {
  it('projects Gemini tool actions into persisted tool messages', () => {
    const envelopes: SessionProtocolEnvelope[] = [
      {
        kind: 'tool-call-end',
        provider: 'gemini',
        source: 'tool',
        sessionId: 'gemini-session-1',
        turnId: 'gemini-session-1',
        toolCallId: 'call-1',
        toolName: 'command_execution',
        stopReason: 'completed',
      },
    ];

    const projection = projectGeminiToolActionMessage({
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
      model: 'gemini-2.5-pro',
      threadId: 'gemini-session-1',
      envelopes,
    });

    expect(projection?.body).toContain('$ pwd');
    expect(projection?.meta.sessionEventType).toBe('tool-call-end');
    expect(projection?.meta.geminiSessionId).toBe('gemini-session-1');
    expect(projection?.options?.type).toBe('tool');
  });

  it('projects Gemini text envelopes into persisted text messages', () => {
    const envelopes: SessionProtocolEnvelope[] = [
      {
        kind: 'text',
        provider: 'gemini',
        source: 'assistant',
        sessionId: 'gemini-session-2',
        turnId: 'gemini-session-2',
        text: '응답 완료',
      },
      {
        kind: 'turn-end',
        provider: 'gemini',
        source: 'result',
        sessionId: 'gemini-session-2',
        turnId: 'gemini-session-2',
        threadId: 'gemini-session-2',
        threadIdSource: 'observed',
        stopReason: 'completed',
      },
    ];

    const projection = projectGeminiTextMessage({
      output: '응답 완료',
      requestedPath: '/workspace/project',
      execCwd: '/workspace/project',
      model: 'gemini-2.5-pro',
      threadId: 'gemini-session-2',
      messageMeta: {
        geminiSessionId: 'gemini-session-2',
        threadIdSource: 'observed',
      },
      envelopes,
    });

    expect(projection?.body).toBe('응답 완료');
    expect(projection?.meta.sessionEventType).toBe('text');
    expect(projection?.meta.sessionTurnStatus).toBe('completed');
    expect(projection?.meta.geminiSessionId).toBe('gemini-session-2');
  });
});
