import { describe, expect, it } from 'vitest';
import {
  looksLikeClaudeActionTranscript,
  mapClaudeStreamOutputToProtocol,
  parseClaudeStreamLine,
  parseClaudeStreamOutput,
} from '../src/runtime/providers/claude/claudeProtocolMapper.js';

describe('claudeProtocolMapper', () => {
  it('keeps action extraction while dropping transcript-only assistant output', () => {
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

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.output).toBe('');
    expect(parsed.actions.length).toBeGreaterThan(0);
    expect(parsed.actions[0]?.command).toBe('ls -la');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('tool-call-start');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('tool-call-end');
    expect(looksLikeClaudeActionTranscript('$ ls -la\nexit code: 0')).toBe(true);
  });

  it('extracts session ids from Claude stream output', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-abc',
      }),
      JSON.stringify({
        type: 'event',
        event: 'agent_message',
        content: '응답 완료',
      }),
    ].join('\n');

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('claude-session-abc');
    expect(parsed.output).toBe('응답 완료');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'text',
    ]);
  });

  it('extracts result-only final output when Claude omits an assistant text event', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-result-only',
      }),
      JSON.stringify({
        type: 'result',
        result: 'OK',
        session_id: 'claude-session-result-only',
      }),
    ].join('\n');

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('claude-session-result-only');
    expect(parsed.output).toBe('OK');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('turn-end');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('stop');
  });

  it('does not misclassify assistant/result usage fields as tool events', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'assistant',
        session_id: 'claude-session-usage',
        message: {
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'OK.' }],
          usage: { output_tokens: 2 },
        },
      }),
      JSON.stringify({
        type: 'result',
        result: 'OK.',
        session_id: 'claude-session-usage',
        usage: { server_tool_use: { web_search_requests: 0 } },
      }),
    ].join('\n');

    const parsed = parseClaudeStreamOutput(streamOutput);
    expect(parsed.sessionId).toBe('claude-session-usage');
    expect(parsed.output).toBe('OK.');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toContain('text');
  });

  it('does not create action events from non-tool result metadata with path-like names', () => {
    const line = JSON.stringify({
      type: 'result',
      result: 'OK.',
      session_id: 'claude-session-false-positive',
      summary: 'updated answer',
      references: [
        { name: 'claude.ai Notion' },
      ],
    });

    const parsed = parseClaudeStreamLine(line);
    expect(parsed.action).toBeUndefined();
    expect(parsed.assistantText).toBe('OK.');
    expect(parsed.sessionId).toBe('claude-session-false-positive');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toEqual([
      'text',
      'turn-end',
      'stop',
    ]);
  });

  it('maps a single Claude tool line into an action event', () => {
    const line = JSON.stringify({
      type: 'tool',
      subtype: 'command_execution',
      callId: 'call-123',
      command: 'git status',
      output: 'On branch main',
    });

    const parsed = parseClaudeStreamLine(line);
    expect(parsed.action?.actionType).toBe('command_execution');
    expect(parsed.action?.callId).toBe('call-123');
    expect(parsed.action?.command).toBe('git status');
    expect(parsed.actionKey).toContain('call-123');
    expect(parsed.envelopes.map((envelope) => envelope.kind)).toEqual([
      'tool-call-start',
      'tool-call-end',
    ]);
  });

  it('maps Claude stream output into protocol envelopes directly', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'system',
        subtype: 'init',
        session_id: 'claude-session-protocol',
      }),
      JSON.stringify({
        type: 'tool',
        subtype: 'command_execution',
        callId: 'call-protocol',
        command: 'pwd',
        output: '/workspace',
        session_id: 'claude-session-protocol',
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'final',
        result: '완료',
        session_id: 'claude-session-protocol',
      }),
    ].join('\n');

    const mapped = mapClaudeStreamOutputToProtocol(streamOutput);
    expect(mapped.sessionId).toBe('claude-session-protocol');
    expect(mapped.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'tool-call-start',
      'tool-call-end',
      'text',
      'turn-end',
      'stop',
    ]);
  });
});
