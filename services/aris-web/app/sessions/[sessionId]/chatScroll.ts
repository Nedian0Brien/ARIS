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
  tolerancePx?: number;
};

type TailRestoreRenderHydratedInput = {
  latestVisibleEventId: string | null;
  latestRenderableEventId: string | null;
  expectedStreamItemCount: number;
  renderedStreamItemCount: number;
};

type ResetScrollForChatChangeInput = {
  previousChatId: string | null;
  nextChatId: string | null;
  isNewChatPlaceholder: boolean;
};

type AutoScrollToBottomInput = {
  isWorkspaceHome: boolean;
  shouldStickToBottom: boolean;
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
  ) {
    return false;
  }

  const tolerancePx = input.tolerancePx ?? 1;
  return Math.abs(input.nextAnchorBottom - input.previousAnchorBottom) <= tolerancePx
    && Math.abs(input.nextScrollHeight - input.previousScrollHeight) <= tolerancePx;
}

export function hasTailRestoreRenderHydrated(input: TailRestoreRenderHydratedInput): boolean {
  if (input.expectedStreamItemCount !== input.renderedStreamItemCount) {
    return false;
  }

  return input.latestVisibleEventId === input.latestRenderableEventId;
}

export function shouldResetScrollForChatChange(input: ResetScrollForChatChangeInput): boolean {
  if (input.isNewChatPlaceholder || !input.nextChatId) {
    return false;
  }
  return input.previousChatId !== input.nextChatId;
}

export function shouldAutoScrollToBottom(input: AutoScrollToBottomInput): boolean {
  if (input.isWorkspaceHome) {
    return false;
  }
  return input.shouldStickToBottom;
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

type ShouldBlockLoadOlderInput = {
  isTailLayoutSettling: boolean;
  isLoadingOlder: boolean;
  hasMoreBefore: boolean;
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
