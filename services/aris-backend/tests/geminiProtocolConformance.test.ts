import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { mapGeminiStreamOutputToProtocol } from '../src/runtime/providers/gemini/geminiProtocolMapper.js';

function readFixture(name: string): string {
  return readFileSync(new URL(`./fixtures/gemini/${name}`, import.meta.url), 'utf8');
}

describe('geminiProtocolConformance', () => {
  it('keeps lowercase sessionid fixtures canonicalized to a single observed session identity', () => {
    const mapped = mapGeminiStreamOutputToProtocol(readFixture('init-lowercase-sessionid.jsonl'));

    expect(mapped.sessionId).toBe('gemini-session-lowercase');
    expect(mapped.envelopes[0]).toMatchObject({
      kind: 'turn-start',
      provider: 'gemini',
      sessionId: 'gemini-session-lowercase',
      threadIdSource: 'observed',
    });
  });

  it('maps tool and final fixtures into the expected envelope sequence', () => {
    const mapped = mapGeminiStreamOutputToProtocol(readFixture('tool-and-final.jsonl'));

    expect(mapped.sessionId).toBe('gemini-thread-tool');
    expect(mapped.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'tool-call-start',
      'tool-call-end',
      'text',
      'turn-end',
      'stop',
    ]);
  });

  it('keeps timeout fixtures attached to the observed Gemini thread identity', () => {
    const mapped = mapGeminiStreamOutputToProtocol(readFixture('stop-timeout-with-threadid.jsonl'));

    expect(mapped.sessionId).toBe('gemini-thread-timeout');
    expect(mapped.envelopes[mapped.envelopes.length - 2]).toMatchObject({
      kind: 'turn-end',
      threadId: 'gemini-thread-timeout',
      stopReason: 'timeout',
    });
    expect(mapped.envelopes[mapped.envelopes.length - 1]).toMatchObject({
      kind: 'stop',
      reason: 'timeout',
    });
  });

  it('keeps actual Gemini success traces canonicalized to turn-start, text, turn-end, stop', () => {
    const mapped = mapGeminiStreamOutputToProtocol(readFixture('actual-simple-success.jsonl'));

    expect(mapped.sessionId).toBe('e39a2b0c-acb5-4571-ac81-dae7ad7db13b');
    expect(mapped.envelopes.map((envelope) => envelope.kind)).toEqual([
      'turn-start',
      'text',
      'turn-end',
      'stop',
    ]);
  });

  it('keeps actual Gemini resume traces on the same observed session identity', () => {
    const mapped = mapGeminiStreamOutputToProtocol(readFixture('actual-resume-success.jsonl'));

    expect(mapped.sessionId).toBe('e39a2b0c-acb5-4571-ac81-dae7ad7db13b');
    expect(mapped.envelopes[2]).toMatchObject({
      kind: 'turn-end',
      sessionId: 'e39a2b0c-acb5-4571-ac81-dae7ad7db13b',
      threadId: 'e39a2b0c-acb5-4571-ac81-dae7ad7db13b',
    });
  });
});
