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
};

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
}: ReduceAutoHideScrollStateInput): AutoHideScrollState {
  if (!isMobile) {
    return {
      hidden: false,
      lastScrollY: currentY,
      resumeGuardUntil: 0,
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
