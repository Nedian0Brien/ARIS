import { describe, expect, it } from 'vitest';
import { buildUsageProbeDescriptor, resolveAvailableChatCommands } from '@/app/sessions/[sessionId]/chatCommands';

describe('chatCommands', () => {
  it('shows the usage command for Codex and Claude only', () => {
    expect(resolveAvailableChatCommands('codex').map((item) => item.id)).toEqual(['usage']);
    expect(resolveAvailableChatCommands('claude').map((item) => item.id)).toEqual(['usage']);
    expect(resolveAvailableChatCommands('gemini')).toEqual([]);
  });

  it('builds a Codex usage probe sequence with status automation', () => {
    const descriptor = buildUsageProbeDescriptor('codex', '/home/ubuntu/project/ARIS');

    expect(descriptor.title).toBe('Codex Usage');
    expect(descriptor.steps.map((step) => step.input)).toEqual([
      'clear\r',
      "cd '/home/ubuntu/project/ARIS'\r",
      'codex --no-alt-screen\r',
      '/status\r',
    ]);
  });

  it('builds a Claude usage probe sequence with status automation', () => {
    const descriptor = buildUsageProbeDescriptor('claude', "/tmp/a'b");

    expect(descriptor.title).toBe('Claude Usage');
    expect(descriptor.steps.map((step) => step.input)).toEqual([
      'clear\r',
      "cd '/tmp/a'\\''b'\r",
      'claude\r',
      '/status\r',
    ]);
  });
});
