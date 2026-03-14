import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  looksLikeGeminiActionTranscript,
  mapGeminiStreamOutputToProtocol,
  parseGeminiStreamLine,
  parseGeminiStreamOutput,
} from '../src/runtime/providers/gemini/geminiProtocolMapper.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/gemini/${name}`, import.meta.url), 'utf8');
}

describe('geminiProtocolMapper', () => {
  it('extracts lowercase sessionid fields from Gemini init payloads', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        sessionid: 'gemini-session-lowercase',
      }),
      JSON.stringify({
        type: 'event',
        event: 'agent_message',
        content: '응답 완료',
      }),
    ].join('\n');

    const parsed = parseGeminiStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('gemini-session-lowercase');
    expect(parsed.output).toBe('응답 완료');
    expect(parsed.envelopes[0]).toMatchObject({
      kind: 'turn-start',
      sessionId: 'gemini-session-lowercase',
      threadId: 'gemini-session-lowercase',
    });
  });

  it('keeps action extraction while dropping transcript-only Gemini output', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'tool',
        subtype: 'command_execution',
        command: 'ls -la',
        output: 'total 8',
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'final',
        output: '$ ls -la\nexit code: 0',
      }),
    ].join('\n');

    const parsed = parseGeminiStreamOutput(streamOutput);
    expect(parsed.output).toBe('');
    expect(parsed.actions[0]?.command).toBe('ls -la');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('tool-call-start');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('tool-call-end');
    expect(looksLikeGeminiActionTranscript('$ ls -la\nexit code: 0')).toBe(true);
  });

  it('maps Gemini stream output into protocol envelopes directly', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        threadId: 'gemini-thread-protocol',
      }),
      JSON.stringify({
        type: 'tool',
        subtype: 'command_execution',
        callId: 'call-protocol',
        command: 'pwd',
        output: '/workspace',
        threadId: 'gemini-thread-protocol',
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'final',
        result: '완료',
        threadId: 'gemini-thread-protocol',
      }),
    ].join('\n');

    const mapped = mapGeminiStreamOutputToProtocol(streamOutput);
    expect(mapped.sessionId).toBe('gemini-thread-protocol');
    expect(mapped.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'tool-call-start',
      'tool-call-end',
      'text',
      'turn-end',
      'stop',
    ]);
  });

  it('parses actual Gemini CLI init/message/result traces', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'init',
        session_id: 'gemini-actual-session',
        model: 'gemini-2.5-flash',
      }),
      JSON.stringify({
        type: 'message',
        role: 'user',
        content: 'Respond with OK only.',
      }),
      JSON.stringify({
        type: 'message',
        role: 'assistant',
        content: 'OK',
        delta: true,
      }),
      JSON.stringify({
        type: 'result',
        status: 'success',
      }),
    ].join('\n');

    const parsed = parseGeminiStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('gemini-actual-session');
    expect(parsed.output).toBe('OK');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'text',
      'turn-end',
      'stop',
    ]);
    expect(parsed.envelopes[2]).toMatchObject({
      kind: 'turn-end',
      sessionId: 'gemini-actual-session',
      threadId: 'gemini-actual-session',
    });
  });

  it('does not create action events from non-tool result metadata with path-like names', () => {
    const line = JSON.stringify({
      type: 'result',
      result: 'OK.',
      thread_id: 'gemini-thread-false-positive',
      references: [
        { name: 'Gemini CLI docs' },
      ],
    });

    const parsed = parseGeminiStreamLine(line);
    expect(parsed.action).toBeUndefined();
    expect(parsed.assistantText).toBe('OK.');
    expect(parsed.sessionId).toBe('gemini-thread-false-positive');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toEqual([
      'text',
      'turn-end',
      'stop',
    ]);
  });

  it('prefers completed Gemini item payloads over delta fragments for final text and actions', () => {
    const fixture = readFixture('streaming-item-completed.jsonl');

    const parsed = parseGeminiStreamOutput(fixture);
    const mapped = mapGeminiStreamOutputToProtocol(fixture);

    expect(parsed.output).toBe('분석 내용 전체');
    expect(parsed.actions).toHaveLength(1);
    expect(parsed.actions[0]).toMatchObject({
      actionType: 'file_read',
      command: 'cat README.md',
      path: 'README.md',
      output: '# README',
    });
    expect(mapped.sessionId).toBe('gemini-stream-thread');
    expect(mapped.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'tool-call-start',
      'tool-call-end',
      'text',
      'turn-end',
      'stop',
    ]);
    expect(mapped.envelopes.find((envelope) => envelope.kind === 'text')).toMatchObject({
      kind: 'text',
      text: '분석 내용 전체',
    });
  });

  it('keeps only the latest Gemini assistant item when multiple delta-only items appear in one turn', () => {
    const fixture = readFixture('multiple-assistant-items.jsonl');

    const parsed = parseGeminiStreamOutput(fixture);
    const mapped = mapGeminiStreamOutputToProtocol(fixture);

    expect(parsed.output).toBe('도입 방안은 다음과 같다.');
    expect(parsed.output).not.toContain('현재 채팅의 구현 방식을 조사하고');
    expect(mapped.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'text',
      'turn-end',
      'stop',
    ]);
    expect(mapped.envelopes.find((envelope) => envelope.kind === 'text')).toMatchObject({
      kind: 'text',
      text: '도입 방안은 다음과 같다.',
      turnId: 'gemini-collapse-thread',
      sessionId: 'gemini-collapse-thread',
    });
  });

  it('keeps Gemini commentary-phase assistant text alongside the final answer', () => {
    const fixture = readFixture('commentary-and-final-answer.jsonl');

    const parsed = parseGeminiStreamOutput(fixture);
    const mapped = mapGeminiStreamOutputToProtocol(fixture);

    expect(parsed.output).toBe('ARIS 프로젝트의 루트 디렉터리를 조사한 결과입니다.');
    expect(mapped.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'text',
      'text',
      'turn-end',
      'stop',
    ]);
    expect(mapped.envelopes.filter((envelope) => envelope.kind === 'text')).toEqual([
      expect.objectContaining({
        kind: 'text',
        text: '현재 디렉터리의 구성을 확인하여 프로젝트의 전반적인 구조를 파악하겠습니다.',
        turnId: 'gemini-commentary-turn',
        sessionId: 'gemini-commentary-thread',
      }),
      expect.objectContaining({
        kind: 'text',
        text: 'ARIS 프로젝트의 루트 디렉터리를 조사한 결과입니다.',
        turnId: 'gemini-commentary-turn',
        sessionId: 'gemini-commentary-thread',
      }),
    ]);
  });

  it('keeps the last completed Gemini commentary when the turn aborts after a later partial', () => {
    const fixture = readFixture('commentary-completed-then-abort.jsonl');

    const parsed = parseGeminiStreamOutput(fixture);
    const mapped = mapGeminiStreamOutputToProtocol(fixture);

    expect(parsed.output).toBe('먼저 상황을 확인하겠습니다.');
    expect(mapped.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'text',
      'turn-end',
      'stop',
    ]);
    expect(mapped.envelopes.at(-2)).toMatchObject({
      kind: 'turn-end',
      stopReason: 'aborted',
      sessionId: 'gemini-abort-thread',
    });
  });

  it('parses item/agentMessage/delta payloads as Gemini assistant partials', () => {
    const line = JSON.stringify({
      method: 'item/agentMessage/delta',
      params: {
        threadId: 'gemini-delta-thread',
        turnId: 'gemini-delta-turn',
        itemId: 'msg-delta-1',
        delta: '실시간 코멘터리',
      },
    });

    const parsed = parseGeminiStreamLine(line);

    expect(parsed.assistantText).toBe('실시간 코멘터리');
    expect(parsed.assistantIsDelta).toBe(true);
    expect(parsed.assistantTurnId).toBe('gemini-delta-turn');
    expect(parsed.assistantItemId).toBe('msg-delta-1');
    expect(parsed.sessionId).toBe('gemini-delta-thread');
  });

  it('parses codex/event/agent_message_delta payloads as Gemini assistant partials', () => {
    const line = JSON.stringify({
      method: 'codex/event/agent_message_delta',
      params: {
        id: 'gemini-delta-turn',
        conversationId: 'gemini-delta-thread',
        msg: {
          type: 'agent_message_delta',
          delta: '추가 텍스트',
        },
      },
    });

    const parsed = parseGeminiStreamLine(line);

    expect(parsed.assistantText).toBe('추가 텍스트');
    expect(parsed.assistantIsDelta).toBe(true);
    expect(parsed.assistantTurnId).toBe('gemini-delta-turn');
    expect(parsed.sessionId).toBe('gemini-delta-thread');
  });
});
