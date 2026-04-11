import { describe, expect, it } from 'vitest';
import { buildUsageProbeDescriptor, resolveAvailableChatCommands } from '@/app/sessions/[sessionId]/chatCommands';

describe('chatCommands', () => {
  it('shows both status and usage commands for Codex and Claude only', () => {
    expect(resolveAvailableChatCommands('codex').map((item) => item.id)).toEqual(['status', 'usage']);
    expect(resolveAvailableChatCommands('claude').map((item) => item.id)).toEqual(['status', 'usage']);
    expect(resolveAvailableChatCommands('gemini')).toEqual([]);
  });

  it('builds a Codex status probe sequence with status automation', () => {
    const descriptor = buildUsageProbeDescriptor('codex', 'status', '/home/ubuntu/project/ARIS');

    expect(descriptor.title).toBe('Codex Status');
    expect(descriptor.steps.map((step) => step.input)).toEqual([
      'clear\r',
      "cd '/home/ubuntu/project/ARIS'\r",
      'codex --no-alt-screen\r',
      '/status\r',
    ]);
  });

  it('builds a Claude parsed usage probe sequence with /usage automation', () => {
    const descriptor = buildUsageProbeDescriptor('claude', 'usage', "/tmp/a'b");

    expect(descriptor.title).toBe('Claude Usage');
    expect(descriptor.steps.map((step) => step.input)).toEqual([
      'clear\r',
      "cd '/tmp/a'\\''b'\r",
      'claude\r',
      '/usage\r',
    ]);
  });
});
