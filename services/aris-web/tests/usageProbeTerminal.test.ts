import { describe, expect, it } from 'vitest';
import {
  formatUsageProbeCloseMessage,
  normalizeUsageProbeMessageData,
} from '@/app/sessions/[sessionId]/usageProbeTerminal';

describe('usageProbeTerminal', () => {
  it('passes string websocket payloads through unchanged', () => {
    expect(normalizeUsageProbeMessageData('plain text')).toBe('plain text');
  });

  it('converts array buffers into terminal byte chunks', () => {
    const buffer = new TextEncoder().encode('hello').buffer;
    const chunk = normalizeUsageProbeMessageData(buffer);
    expect(chunk).toBeInstanceOf(Uint8Array);
    expect(new TextDecoder().decode(chunk as Uint8Array)).toBe('hello');
  });

  it('formats websocket close information for the UI', () => {
    expect(formatUsageProbeCloseMessage(1006, '')).toBe('연결 종료됨 (code 1006)');
    expect(formatUsageProbeCloseMessage(1000, 'normal')).toBe('연결 종료됨 (code 1000, normal)');
  });
});
