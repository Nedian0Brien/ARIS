import { describe, expect, it } from 'vitest';

import {
  primeAutoHideScrollState,
  reduceAutoHideScrollState,
  type AutoHideScrollState,
} from '@/components/layout/mobileScrollAutoHide';

describe('mobileScrollAutoHide', () => {
  const thresholds = {
    nearTopThreshold: 32,
    hideAfterScrollY: 72,
    hideDeltaThreshold: 8,
    revealDeltaThreshold: 8,
  };

  it('hides after a sustained downward mobile scroll past the thresholds', () => {
    const next = reduceAutoHideScrollState({
      state: {
        hidden: false,
        lastScrollY: 80,
        resumeGuardUntil: 0,
      },
      currentY: 96,
      now: 1_000,
      isMobile: true,
      thresholds,
    });

    expect(next.hidden).toBe(true);
    expect(next.lastScrollY).toBe(96);
  });

  it('reveals again when the user scrolls upward', () => {
    const next = reduceAutoHideScrollState({
      state: {
        hidden: true,
        lastScrollY: 180,
        resumeGuardUntil: 0,
      },
      currentY: 160,
      now: 1_000,
      isMobile: true,
      thresholds,
    });

    expect(next.hidden).toBe(false);
    expect(next.lastScrollY).toBe(160);
  });

  it('forces the controls visible near the top and on desktop', () => {
    const nearTop = reduceAutoHideScrollState({
      state: {
        hidden: true,
        lastScrollY: 80,
        resumeGuardUntil: 0,
      },
      currentY: 12,
      now: 1_000,
      isMobile: true,
      thresholds,
    });

    expect(nearTop.hidden).toBe(false);

    const desktop = reduceAutoHideScrollState({
      state: {
        hidden: true,
        lastScrollY: 80,
        resumeGuardUntil: 0,
      },
      currentY: 220,
      now: 1_000,
      isMobile: false,
      thresholds,
    });

    expect(desktop.hidden).toBe(false);
    expect(desktop.resumeGuardUntil).toBe(0);
  });

  it('re-baselines and reveals on tab resume instead of reacting to stale scroll deltas', () => {
    const resumed = primeAutoHideScrollState({
      currentY: 420,
      now: 2_000,
      resumeGuardMs: 240,
    });

    expect(resumed).toEqual<AutoHideScrollState>({
      hidden: false,
      lastScrollY: 420,
      resumeGuardUntil: 2_240,
    });

    const guarded = reduceAutoHideScrollState({
      state: resumed,
      currentY: 860,
      now: 2_100,
      isMobile: true,
      thresholds,
    });

    expect(guarded.hidden).toBe(false);
    expect(guarded.lastScrollY).toBe(860);
  });

  it('stays revealed while session scroll ownership is in a system-managed resume phase', () => {
    const next = reduceAutoHideScrollState({
      state: {
        hidden: true,
        lastScrollY: 240,
        resumeGuardUntil: 0,
      },
      currentY: 860,
      now: 3_000,
      isMobile: true,
      thresholds,
      isSessionScrollActive: true,
      sessionScrollPhase: 'resuming',
    } as Parameters<typeof reduceAutoHideScrollState>[0] & {
      isSessionScrollActive: boolean;
      sessionScrollPhase: 'resuming';
    });

    expect(next.hidden).toBe(false);
    expect(next.lastScrollY).toBe(860);
  });

  it('stays revealed while chat tail restoration owns scroll movement', () => {
    const next = reduceAutoHideScrollState({
      state: {
        hidden: true,
        lastScrollY: 240,
        resumeGuardUntil: 0,
      },
      currentY: 920,
      now: 3_000,
      isMobile: true,
      thresholds,
      isSessionScrollActive: true,
      sessionScrollPhase: 'restoring-tail',
    } as Parameters<typeof reduceAutoHideScrollState>[0] & {
      isSessionScrollActive: boolean;
      sessionScrollPhase: 'restoring-tail';
    });

    expect(next.hidden).toBe(false);
    expect(next.lastScrollY).toBe(920);
  });
});
