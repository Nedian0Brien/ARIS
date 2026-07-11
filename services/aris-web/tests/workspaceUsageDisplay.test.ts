import { describe, expect, it } from 'vitest';
import { computeContextUsageRatio, formatTokenCount } from '@/components/project-chat/projectChatSurfaceUtils';

describe('formatTokenCount', () => {
  it('formats token counts with k/M units', () => {
    expect(formatTokenCount(0)).toBe('0');
    expect(formatTokenCount(982)).toBe('982');
    expect(formatTokenCount(12_400)).toBe('12.4k');
    expect(formatTokenCount(258_400)).toBe('258.4k');
    expect(formatTokenCount(5_569_014)).toBe('5.6M');
  });

  it('renders a dash for missing values', () => {
    expect(formatTokenCount(null)).toBe('—');
    expect(formatTokenCount(undefined)).toBe('—');
    expect(formatTokenCount(Number.NaN)).toBe('—');
    expect(formatTokenCount(-1)).toBe('—');
  });
});

describe('computeContextUsageRatio', () => {
  it('uses last-turn tokens over the context window', () => {
    // 실측값: lastTurn 107,594 / window 258,400 ≈ 41.6%
    const ratio = computeContextUsageRatio({
      contextWindow: 258_400,
      lastTurn: { totalTokens: 107_594 },
    });
    expect(ratio).toBeCloseTo(0.4164, 3);
  });

  it('clamps to 1 and rejects unusable inputs', () => {
    expect(computeContextUsageRatio({ contextWindow: 100, lastTurn: { totalTokens: 250 } })).toBe(1);
    expect(computeContextUsageRatio({ contextWindow: null, lastTurn: { totalTokens: 10 } })).toBeNull();
    expect(computeContextUsageRatio({ contextWindow: 100, lastTurn: null })).toBeNull();
    expect(computeContextUsageRatio(null)).toBeNull();
    expect(computeContextUsageRatio(undefined)).toBeNull();
  });
});
