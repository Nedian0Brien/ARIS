import { describe, expect, it } from 'vitest';
import { formatCodexQuotaUsage } from '@/app/sessions/[sessionId]/chatQuotaUsage';

describe('chatQuotaUsage formatting', () => {
  it('formats the Codex quota usage summary', () => {
    expect(formatCodexQuotaUsage({
      inputTokens: 1234,
      cachedInputTokens: 222,
      outputTokens: 56,
      totalTokens: 1290,
      updatedAt: '2026-04-11T02:00:00.000Z',
    })).toBe('입력 1,234 · 캐시 222 · 출력 56 · 합계 1,290');
  });

  it('returns null when quota usage is empty', () => {
    expect(formatCodexQuotaUsage({
      updatedAt: '2026-04-11T02:00:00.000Z',
    })).toBeNull();
  });
});
