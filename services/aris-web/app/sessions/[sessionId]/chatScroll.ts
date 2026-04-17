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
  visibleNonUserEventCount: number;
  deferredVisibleNonUserEventCount: number;
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
  if (input.visibleNonUserEventCount !== input.deferredVisibleNonUserEventCount) {
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
