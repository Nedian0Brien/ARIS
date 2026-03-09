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
});
