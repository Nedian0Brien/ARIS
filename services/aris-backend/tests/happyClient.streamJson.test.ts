import { describe, expect, it } from 'vitest';
import { happyClientTestHooks } from '../src/runtime/happyClient.js';

describe('happyClient stream-json parsing', () => {
  it('marks Claude transcript-only output as non-message while keeping action extraction', () => {
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

    const parsed = happyClientTestHooks.parseAgentStreamOutput(streamOutput);
    expect(parsed.output).toBe('');
    expect(parsed.actions.length).toBeGreaterThan(0);
    expect(parsed.actions[0]?.command).toContain('ls -la');
    expect(happyClientTestHooks.looksLikeActionTranscript('$ ls -la\nexit code: 0')).toBe(true);
  });

  it('parses Gemini stream-json sample into both action and assistant message', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'tool',
        subtype: 'command_execution',
        command: 'cat README.md',
        output: '# README',
      }),
      JSON.stringify({
        type: 'result',
        subtype: 'final',
        output: '$ cat README.md\nexit code: 0',
      }),
      JSON.stringify({
        type: 'event',
        event: 'agent_message',
        content: 'README 내용을 확인했고 핵심만 요약했습니다.',
      }),
    ].join('\n');

    const parsed = happyClientTestHooks.parseAgentStreamOutput(streamOutput);
    expect(parsed.output).toBe('README 내용을 확인했고 핵심만 요약했습니다.');
    expect(parsed.actions.length).toBeGreaterThan(0);
    expect(parsed.actions[0]?.command).toContain('cat README.md');
  });

  it('extracts tool call ids from stream-json action events', () => {
    const streamOutput = [
      JSON.stringify({
        type: 'tool',
        subtype: 'command_execution',
        callId: 'call-123',
        command: 'git status',
        output: 'On branch main',
      }),
      JSON.stringify({
        type: 'event',
        event: 'agent_message',
        content: '현재 상태를 확인했습니다.',
      }),
    ].join('\n');

    const parsed = happyClientTestHooks.parseAgentStreamOutput(streamOutput);
    expect(parsed.actions.length).toBe(1);
    expect(parsed.actions[0]?.callId).toBe('call-123');
    expect(parsed.actions[0]?.command).toBe('git status');
  });

  it('parses a single stream-json line into action metadata', () => {
    const line = JSON.stringify({
      type: 'tool',
      subtype: 'command_execution',
      callId: 'call-line-1',
      command: 'ls -la',
      output: 'total 12',
    });

    const parsed = happyClientTestHooks.parseAgentStreamLine(line);
    expect(parsed.action?.actionType).toBe('file_list');
    expect(parsed.action?.callId).toBe('call-line-1');
    expect(parsed.action?.command).toBe('ls -la');
    expect(parsed.actionKey).toContain('call-line-1');
  });

  it('builds session hint meta for text and tool-call events', () => {
    const textMeta = happyClientTestHooks.buildSessionHintMeta({
      eventType: 'text',
    });
    expect((textMeta.sessionEvent as { ev: { t: string } }).ev.t).toBe('text');
    expect(textMeta.sessionEventType).toBe('text');

    const toolMeta = happyClientTestHooks.buildSessionHintMeta({
      eventType: 'tool-call-end',
      callId: 'call-9',
    });
    expect((toolMeta.sessionEvent as { ev: { t: string; call?: string } }).ev.t).toBe('tool-call-end');
    expect((toolMeta.sessionEvent as { ev: { t: string; call?: string } }).ev.call).toBe('call-9');
    expect(toolMeta.sessionCallId).toBe('call-9');
  });

  it('extracts message text from wrapped happy payload content', () => {
    const wrappedPayload = {
      t: 'json',
      c: JSON.stringify({
        role: 'agent',
        title: 'Text Reply',
        text: 'wrapped content from happy',
      }),
    };

    const parsed = happyClientTestHooks.parseMessagePayloadText(wrappedPayload);
    expect(parsed.role).toBe('agent');
    expect(parsed.title).toBe('Text Reply');
    expect(parsed.text).toBe('wrapped content from happy');
  });

  it('falls back to raw payload text when happy payload parsing fails', () => {
    const parsed = happyClientTestHooks.parseMessagePayloadText({
      unknownShape: { foo: 'bar' },
    });
    expect(parsed.text).toContain('[UNPARSED HAPPY PAYLOAD]');
    expect(parsed.text).toContain('"unknownShape"');
  });

  it('skips duplicate agent messages for the same turn only', () => {
    const seen = new Set<string>();

    expect(happyClientTestHooks.shouldSkipDuplicateAgentMessage(seen, 'turn-1', 'same reply')).toBe(false);
    expect(happyClientTestHooks.shouldSkipDuplicateAgentMessage(seen, 'turn-1', 'same reply')).toBe(true);
    expect(happyClientTestHooks.shouldSkipDuplicateAgentMessage(seen, 'turn-1', 'different reply')).toBe(false);
    expect(happyClientTestHooks.shouldSkipDuplicateAgentMessage(seen, 'turn-2', 'same reply')).toBe(false);
  });
});
