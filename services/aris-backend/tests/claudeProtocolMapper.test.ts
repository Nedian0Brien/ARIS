import { describe, expect, it } from 'vitest';
import {
  looksLikeClaudeActionTranscript,
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
  });
});
