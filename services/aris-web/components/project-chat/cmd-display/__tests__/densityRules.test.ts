import { describe, it, expect } from 'vitest';
import { computeAutoDensity } from '../densityRules';

describe('computeAutoDensity', () => {
  it('returns expanded for running events', () => {
    expect(computeAutoDensity({ isRunning: true, distanceFromLatest: 5, isError: false })).toBe('expanded');
  });
  it('returns default for most-recent completed (distance 0)', () => {
    expect(computeAutoDensity({ isRunning: false, distanceFromLatest: 0, isError: false })).toBe('default');
  });
  it('returns minimal for older completed events', () => {
    expect(computeAutoDensity({ isRunning: false, distanceFromLatest: 1, isError: false })).toBe('minimal');
    expect(computeAutoDensity({ isRunning: false, distanceFromLatest: 10, isError: false })).toBe('minimal');
  });
  it('keeps errored events at default or higher', () => {
    expect(computeAutoDensity({ isRunning: false, distanceFromLatest: 50, isError: true })).toBe('default');
    expect(computeAutoDensity({ isRunning: true,  distanceFromLatest: 50, isError: true })).toBe('expanded');
  });
});
