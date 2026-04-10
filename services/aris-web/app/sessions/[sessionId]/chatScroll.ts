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
