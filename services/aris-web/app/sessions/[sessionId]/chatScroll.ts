type ScrollToBottomTargetInput = {
  isMobileLayout: boolean;
  keyboardOpen: boolean;
};

type MobileWindowScrollTopInput = {
  scrollHeight: number;
  viewportHeight: number;
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
  if (!input.activeChatId || !input.hasLoadedCurrentChat) {
    return false;
  }
  if (input.eventsForChatId !== input.activeChatId) {
    return false;
  }
  return input.restoredForChatId !== input.activeChatId;
}
