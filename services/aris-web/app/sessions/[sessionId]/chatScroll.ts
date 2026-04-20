type ScrollToBottomTargetInput = {
  isMobileLayout: boolean;
  keyboardOpen: boolean;
};

type MobileWindowScrollTopInput = {
  scrollHeight: number;
  viewportHeight: number;
};

type TailScrollAnchorIdInput = {
  latestVisibleEventId: string | null;
};

type TailLayoutSettledInput = {
  previousAnchorBottom: number | null;
  nextAnchorBottom: number | null;
  previousScrollHeight: number | null;
  nextScrollHeight: number | null;
  previousViewportHeight: number | null;
  nextViewportHeight: number | null;
  tolerancePx?: number;
};

type TailRestoreRenderHydratedInput = {
  latestVisibleEventId: string | null;
  latestRenderableEventId: string | null;
  expectedStreamItemCount: number;
  renderedStreamItemCount: number;
};

type ResumePhaseSettledInput = {
  previousScrollTop: number | null;
  nextScrollTop: number | null;
  previousViewportHeight: number | null;
  nextViewportHeight: number | null;
  tolerancePx?: number;
};

type ResetScrollForChatChangeInput = {
  previousChatId: string | null;
  nextChatId: string | null;
  isNewChatPlaceholder: boolean;
  isTailRestorePending?: boolean;
};

type AutoScrollToBottomInput = {
  isWorkspaceHome: boolean;
  shouldStickToBottom: boolean;
  isTailRestorePending?: boolean;
};

type MobileBottomLockStateInput = {
  isNearBottom: boolean;
  isTailRestorePending?: boolean;
};

type TailSettleCompletionScrollInput = {
  isMobileLayout: boolean;
  shouldUseWindow: boolean;
  anchorBottom: number | null;
  viewportHeight: number;
  tolerancePx?: number;
};

export type ComposerDockMetrics = {
  height: number;
  left: number;
  width: number;
};

type TailRestoreLayoutReadinessInput = {
  isMobileLayout: boolean;
  isMobileLayoutHydrated: boolean;
  isViewportLayoutReady: boolean;
  isComposerDockLayoutReady: boolean;
};

type RestoreTailScrollOnChatEntryInput = {
  activeChatId: string | null;
  eventsForChatId: string | null;
  hasLoadedCurrentChat: boolean;
  isTailRestoreHydrated: boolean;
  isWorkspaceHome: boolean;
  isNewChatPlaceholder: boolean;
  restoredForChatId: string | null;
};

export type SessionScrollPhase =
  | 'idle'
  | 'user-scrolling'
  | 'restoring-tail'
  | 'loading-older'
  | 'resuming'
  | 'viewport-reflow';

type ResolveSessionScrollPhaseInput = {
  currentPhase: SessionScrollPhase;
  event:
    | 'resume-start'
    | 'scroll-observed'
    | 'viewport-changed'
    | 'resume-stable'
    | 'tail-restore-start'
    | 'tail-restore-complete'
    | 'older-load-start'
    | 'older-load-complete'
    | 'user-scroll';
};

export function resolveScrollToBottomTarget(input: ScrollToBottomTargetInput): 'window' | 'stream' {
  if (input.isMobileLayout) {
    return 'window';
  }
  return 'stream';
}

export function resolveMobileWindowScrollTop(input: MobileWindowScrollTopInput): number {
  return Math.max(0, input.scrollHeight - input.viewportHeight);
}

export function resolveTailScrollAnchorId(input: TailScrollAnchorIdInput): string | null {
  if (!input.latestVisibleEventId) {
    return null;
  }
  return `event-${input.latestVisibleEventId}`;
}

export function hasTailLayoutSettled(input: TailLayoutSettledInput): boolean {
  if (
    input.previousAnchorBottom === null
    || input.nextAnchorBottom === null
    || input.previousScrollHeight === null
    || input.nextScrollHeight === null
    || input.previousViewportHeight === null
    || input.nextViewportHeight === null
  ) {
    return false;
  }

  const tolerancePx = input.tolerancePx ?? 1;
  return Math.abs(input.nextAnchorBottom - input.previousAnchorBottom) <= tolerancePx
    && Math.abs(input.nextScrollHeight - input.previousScrollHeight) <= tolerancePx
    && Math.abs(input.nextViewportHeight - input.previousViewportHeight) <= tolerancePx;
}

export function hasTailRestoreRenderHydrated(input: TailRestoreRenderHydratedInput): boolean {
  if (input.expectedStreamItemCount !== input.renderedStreamItemCount) {
    return false;
  }

  return input.latestVisibleEventId === input.latestRenderableEventId;
}

export function hasResumePhaseSettled(input: ResumePhaseSettledInput): boolean {
  if (
    input.previousScrollTop === null
    || input.nextScrollTop === null
    || input.previousViewportHeight === null
    || input.nextViewportHeight === null
  ) {
    return false;
  }

  const tolerancePx = input.tolerancePx ?? 1;
  return Math.abs(input.nextScrollTop - input.previousScrollTop) <= tolerancePx
    && Math.abs(input.nextViewportHeight - input.previousViewportHeight) <= tolerancePx;
}

export function resolveTailRestoreLayoutReady(input: TailRestoreLayoutReadinessInput): boolean {
  if (!input.isMobileLayoutHydrated) {
    return false;
  }

  if (!input.isMobileLayout) {
    return true;
  }

  return input.isMobileLayoutHydrated
    && input.isViewportLayoutReady
    && input.isComposerDockLayoutReady;
}

export function haveComposerDockMetricsChanged(
  previousMetrics: ComposerDockMetrics | null,
  nextMetrics: ComposerDockMetrics,
): boolean {
  if (!previousMetrics) {
    return true;
  }

  return previousMetrics.height !== nextMetrics.height
    || previousMetrics.left !== nextMetrics.left
    || previousMetrics.width !== nextMetrics.width;
}

export function shouldResetScrollForChatChange(input: ResetScrollForChatChangeInput): boolean {
  if (input.isNewChatPlaceholder || !input.nextChatId) {
    return false;
  }
  if (input.isTailRestorePending) {
    return false;
  }
  return input.previousChatId !== input.nextChatId;
}

export function shouldAutoScrollToBottom(input: AutoScrollToBottomInput): boolean {
  if (input.isWorkspaceHome) {
    return false;
  }
  if (input.isTailRestorePending) {
    return false;
  }
  return input.shouldStickToBottom;
}

export function resolveMobileBottomLockState(input: MobileBottomLockStateInput): {
  shouldStickToBottom: boolean;
  showScrollToBottom: boolean;
} {
  if (input.isTailRestorePending) {
    return {
      shouldStickToBottom: true,
      showScrollToBottom: false,
    };
  }

  return {
    shouldStickToBottom: input.isNearBottom,
    showScrollToBottom: !input.isNearBottom,
  };
}

export function shouldSkipTailSettleCompletionScroll(input: TailSettleCompletionScrollInput): boolean {
  if (!input.isMobileLayout || !input.shouldUseWindow || input.anchorBottom === null) {
    return false;
  }

  const tolerancePx = input.tolerancePx ?? 1;
  return Math.abs(input.anchorBottom - input.viewportHeight) <= tolerancePx;
}

export function shouldRestoreTailScrollOnChatEntry(input: RestoreTailScrollOnChatEntryInput): boolean {
  if (input.isWorkspaceHome || input.isNewChatPlaceholder) {
    return false;
  }
  if (!input.activeChatId || !input.hasLoadedCurrentChat || !input.isTailRestoreHydrated) {
    return false;
  }
  if (input.eventsForChatId !== input.activeChatId) {
    return false;
  }
  return input.restoredForChatId !== input.activeChatId;
}

export function resolveSessionScrollPhase(input: ResolveSessionScrollPhaseInput): SessionScrollPhase {
  switch (input.event) {
    case 'resume-start':
      return 'resuming';
    case 'viewport-changed':
      return input.currentPhase === 'resuming' || input.currentPhase === 'viewport-reflow'
        ? 'viewport-reflow'
        : input.currentPhase;
    case 'resume-stable':
      return input.currentPhase === 'resuming' || input.currentPhase === 'viewport-reflow'
        ? 'idle'
        : input.currentPhase;
    case 'tail-restore-start':
      return 'restoring-tail';
    case 'tail-restore-complete':
      return input.currentPhase === 'restoring-tail' ? 'idle' : input.currentPhase;
    case 'older-load-start':
      return 'loading-older';
    case 'older-load-complete':
      return input.currentPhase === 'loading-older' ? 'idle' : input.currentPhase;
    case 'user-scroll':
      return input.currentPhase === 'idle' ? 'user-scrolling' : input.currentPhase;
    case 'scroll-observed':
    default:
      return input.currentPhase;
  }
}

type ShouldBlockLoadOlderInput = {
  isTailLayoutSettling: boolean;
  isLoadingOlder: boolean;
  hasMoreBefore: boolean;
  scrollPhase?: SessionScrollPhase;
};

type WindowScrollFallbackInput = {
  isMobileLayout: boolean;
  streamScrollHeight: number | null;
  streamClientHeight: number | null;
  documentScrollHeight: number;
  viewportHeight: number;
  tolerancePx?: number;
};

type ManualScrollRestorationInput = {
  activeChatId: string | null;
  isWorkspaceHome: boolean;
  isNewChatPlaceholder: boolean;
};

export function shouldBlockLoadOlder(input: ShouldBlockLoadOlderInput): boolean {
  if (
    input.scrollPhase === 'resuming'
    || input.scrollPhase === 'viewport-reflow'
  ) {
    return true;
  }

  return input.isTailLayoutSettling || input.isLoadingOlder || !input.hasMoreBefore;
}

export function shouldUseWindowScrollFallback(input: WindowScrollFallbackInput): boolean {
  if (input.isMobileLayout) {
    return true;
  }

  const tolerancePx = input.tolerancePx ?? 1;
  const documentScrollable = input.documentScrollHeight - input.viewportHeight > tolerancePx;
  if (!documentScrollable) {
    return false;
  }

  if (input.streamScrollHeight === null || input.streamClientHeight === null) {
    return true;
  }

  const streamScrollable = input.streamScrollHeight - input.streamClientHeight > tolerancePx;
  return !streamScrollable;
}

export function shouldUseManualScrollRestoration(input: ManualScrollRestorationInput): boolean {
  if (input.isWorkspaceHome || input.isNewChatPlaceholder) {
    return false;
  }
  return Boolean(input.activeChatId);
}

const NEAR_BOTTOM_THRESHOLD_PX = 80;

export function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= NEAR_BOTTOM_THRESHOLD_PX;
}

export function isNearWindowBottom(): boolean {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const scrollTop = Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);
  const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
  return scrollHeight - (scrollTop + viewportHeight) <= NEAR_BOTTOM_THRESHOLD_PX;
}
