import { describe, expect, it } from 'vitest';
import { parseUsageProbeOutput } from '@/app/sessions/[sessionId]/usageProbeParser';

describe('usageProbeParser', () => {
  it('parses Codex-style remaining usage lines', () => {
    const parsed = parseUsageProbeOutput('codex', `
      5-hour remaining: 72%
      resets in 1h 42m
      Weekly remaining: 43%
      resets in 4d 3h
    `);

    expect(parsed.fiveHour?.remainingPercent).toBe(72);
    expect(parsed.fiveHour?.resetText).toContain('1h 42m');
    expect(parsed.weekly?.remainingPercent).toBe(43);
    expect(parsed.weekly?.resetText).toContain('4d 3h');
  });

  it('parses Claude-style usage output with limit wording', () => {
    const parsed = parseUsageProbeOutput('claude', `
      5-hour limit: 68% remaining
      reset: 2h 10m
      Weekly limit: 51% remaining
      reset: Apr 14, 09:00
    `);

    expect(parsed.fiveHour?.remainingPercent).toBe(68);
    expect(parsed.weekly?.remainingPercent).toBe(51);
    expect(parsed.weekly?.resetText).toContain('Apr 14');
  });
});
