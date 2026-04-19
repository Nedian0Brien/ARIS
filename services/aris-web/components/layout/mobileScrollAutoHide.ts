import type { SessionScrollPhase } from '@/app/sessions/[sessionId]/chatScroll';

export type AutoHideScrollState = {
  hidden: boolean;
  lastScrollY: number;
  resumeGuardUntil: number;
};

export type AutoHideScrollThresholds = {
  nearTopThreshold: number;
  hideAfterScrollY: number;
  hideDeltaThreshold: number;
  revealDeltaThreshold: number;
};

type PrimeAutoHideScrollStateInput = {
  currentY: number;
  now: number;
  resumeGuardMs: number;
};

type ReduceAutoHideScrollStateInput = {
  state: AutoHideScrollState;
  currentY: number;
  now: number;
  isMobile: boolean;
  thresholds: AutoHideScrollThresholds;
  isSessionScrollActive?: boolean;
  sessionScrollPhase?: SessionScrollPhase;
};

function shouldForceVisibleForSessionPhase(input: {
  isSessionScrollActive?: boolean;
  sessionScrollPhase?: SessionScrollPhase;
}): boolean {
  if (!input.isSessionScrollActive) {
    return false;
  }

  return input.sessionScrollPhase === 'resuming'
    || input.sessionScrollPhase === 'viewport-reflow'
    || input.sessionScrollPhase === 'restoring-tail'
    || input.sessionScrollPhase === 'loading-older';
}

export function primeAutoHideScrollState({
  currentY,
  now,
  resumeGuardMs,
}: PrimeAutoHideScrollStateInput): AutoHideScrollState {
  return {
    hidden: false,
    lastScrollY: currentY,
    resumeGuardUntil: now + Math.max(0, resumeGuardMs),
  };
}

export function reduceAutoHideScrollState({
  state,
  currentY,
  now,
  isMobile,
  thresholds,
  isSessionScrollActive,
  sessionScrollPhase,
}: ReduceAutoHideScrollStateInput): AutoHideScrollState {
  if (!isMobile) {
    return {
      hidden: false,
      lastScrollY: currentY,
      resumeGuardUntil: 0,
    };
  }

  if (shouldForceVisibleForSessionPhase({ isSessionScrollActive, sessionScrollPhase })) {
    return {
      hidden: false,
      lastScrollY: currentY,
      resumeGuardUntil: state.resumeGuardUntil,
    };
  }

  if (now < state.resumeGuardUntil) {
    return {
      ...state,
      hidden: false,
      lastScrollY: currentY,
    };
  }

  const delta = currentY - state.lastScrollY;
  let hidden = state.hidden;

  if (currentY < thresholds.nearTopThreshold) {
    hidden = false;
  } else if (delta > thresholds.hideDeltaThreshold && currentY > thresholds.hideAfterScrollY) {
    hidden = true;
  } else if (delta < -thresholds.revealDeltaThreshold) {
    hidden = false;
  }

  return {
    hidden,
    lastScrollY: currentY,
    resumeGuardUntil: state.resumeGuardUntil,
  };
}
