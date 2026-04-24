'use client';

import {
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import {
  hasTailLayoutSettled,
  isNearBottom,
  resolveTailScrollAnchorId,
  shouldRestoreTailScrollOnChatEntry,
} from './chatScroll';
import { recordScrollDebugEvent } from './scrollDebug';

const TAIL_LAYOUT_SETTLE_TIMEOUT_MS = 1200;
const TAIL_LAYOUT_SETTLE_IDLE_MS = 160;

export type UseChatTailRestoreInput = {
  activeChatIdResolved: string | null;
  /**
   * Chat ID of events currently loaded. When it differs from activeChatIdResolved
   * (transient during chat switch), tail restore is suppressed until they match.
   */
  eventsForChatId: string | null;
  hasLoadedCurrentChat: boolean;
  hasDetachedTail: boolean;
  isTailRestoreHydrated: boolean;
  isNewChatPlaceholder: boolean;
  isWorkspaceHome: boolean;
  isTailRestoreLayoutReady: boolean;
  initialShowChatEntryLoading: boolean;
  resetToLatestWindow: () => Promise<void>;
  scrollRef: RefObject<HTMLDivElement | null>;
  latestVisibleEventIdRef: RefObject<string | null>;
};

type ResolveTailRestoreSettleActionInput = {
  activeChatIdResolved: string | null;
  eventsForChatId: string | null;
  hasLoadedCurrentChat: boolean;
  isTailRestoreLayoutReady: boolean;
  isSettleInFlight: boolean;
  isTailRestoreHydrated: boolean;
  isNewChatPlaceholder: boolean;
  isWorkspaceHome: boolean;
  restoredForChatId: string | null;
};

export function resolveTailRestoreLoopTransition(input: {
  wasMidSettle: boolean;
  settleAction: 'skip' | 'start' | 'continue';
}): {
  shouldCancelExistingSettle: boolean;
  shouldReenablePendingReveal: boolean;
  shouldRestartSettle: boolean;
  shouldResetTailRestoreState: boolean;
} {
  if (input.settleAction === 'skip') {
    return {
      shouldCancelExistingSettle: input.wasMidSettle,
      shouldReenablePendingReveal: false,
      shouldRestartSettle: false,
      shouldResetTailRestoreState: input.wasMidSettle,
    };
  }

  return {
    shouldCancelExistingSettle: input.wasMidSettle,
    shouldReenablePendingReveal: input.settleAction === 'start',
    shouldRestartSettle: true,
    shouldResetTailRestoreState: false,
  };
}

export type UseChatTailRestoreOutput = {
  isTailLayoutSettling: boolean;
  /**
   * Ref mirror of isTailLayoutSettling. Use this (not the state value) inside
   * event listener closures and useCallback to avoid stale captures.
   */
  isTailLayoutSettlingRef: MutableRefObject<boolean>;
  isInitialChatEntryPendingReveal: boolean;
  /**
   * shouldStickToBottomRef is written externally by handleComposerFocus,
   * handleStreamScroll, and submit logic. All external write sites are safe
   * during the settle window — see spec for analysis.
   */
  shouldStickToBottomRef: MutableRefObject<boolean>;
  showScrollToBottom: boolean;
  setShowScrollToBottom: Dispatch<SetStateAction<boolean>>;
  scrollConversationToBottom: (behavior?: ScrollBehavior) => void;
  restoreConversationToTail: (behavior?: ScrollBehavior) => void;
  syncScrollToBottomButton: () => void;
  handleJumpToBottom: () => void;
};

export async function jumpToLatestPageWindow(input: {
  shouldStickToBottomRef: MutableRefObject<boolean> | { current: boolean };
  setShowScrollToBottom: Dispatch<SetStateAction<boolean>> | ((value: boolean) => void);
  resetToLatestWindow: () => Promise<void>;
  restoreConversationToTail: (behavior?: ScrollBehavior) => void;
  behavior?: ScrollBehavior;
}): Promise<void> {
  recordScrollDebugEvent({
    kind: 'trigger',
    source: 'tail:jumpToLatestPageWindow:start',
    detail: {
      behavior: input.behavior ?? 'smooth',
    },
  });
  input.shouldStickToBottomRef.current = true;
  input.setShowScrollToBottom(false);
  await input.resetToLatestWindow();
  input.restoreConversationToTail(input.behavior ?? 'smooth');
}

export function resolveTailRestoreSettleAction(
  input: ResolveTailRestoreSettleActionInput,
): 'skip' | 'start' | 'continue' {
  if (input.isSettleInFlight && input.restoredForChatId === input.activeChatIdResolved) {
    return 'continue';
  }

  if (!input.isTailRestoreLayoutReady) {
    return 'skip';
  }

  if (shouldRestoreTailScrollOnChatEntry({
    activeChatId: input.activeChatIdResolved,
    eventsForChatId: input.eventsForChatId,
    hasLoadedCurrentChat: input.hasLoadedCurrentChat,
    isTailRestoreHydrated: input.isTailRestoreHydrated,
    isWorkspaceHome: input.isWorkspaceHome,
    isNewChatPlaceholder: input.isNewChatPlaceholder,
    restoredForChatId: input.restoredForChatId,
  })) {
    return 'start';
  }

  return 'skip';
}

export function useChatTailRestore({
  activeChatIdResolved,
  eventsForChatId,
  hasLoadedCurrentChat,
  hasDetachedTail,
  isTailRestoreHydrated,
  isNewChatPlaceholder,
  isWorkspaceHome,
  isTailRestoreLayoutReady,
  initialShowChatEntryLoading,
  resetToLatestWindow,
  scrollRef,
  latestVisibleEventIdRef,
}: UseChatTailRestoreInput): UseChatTailRestoreOutput {
  const [isInitialChatEntryPendingReveal, setIsInitialChatEntryPendingReveal] = useState(initialShowChatEntryLoading);
  const [isTailLayoutSettling, setIsTailLayoutSettling] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const restoredTailScrollForChatRef = useRef<string | null>(null);
  const tailRestoreCancelRef = useRef<(() => void) | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const isTailLayoutSettlingRef = useRef(false);
  const isJumpingToLatestRef = useRef(false);
  const debugInstanceIdRef = useRef(Math.random().toString(36).slice(2, 8));

  useEffect(() => {
    const instanceId = debugInstanceIdRef.current;
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'tail:hook:mounted',
      detail: {
        instanceId,
      },
    });

    return () => {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:hook:unmounted',
        detail: {
          instanceId,
        },
      });
    };
  }, []);

  const scrollConversationToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const stream = scrollRef.current;
    if (!stream) {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:scrollConversationToBottom:no-stream',
        detail: {
          behavior,
        },
      });
      return;
    }
    const top = Math.max(0, stream.scrollHeight - stream.clientHeight);
    recordScrollDebugEvent({
      kind: 'write',
      source: 'tail:scrollConversationToBottom:stream',
      top,
      behavior,
    });
    stream.scrollTo({ top, behavior });
  }, [scrollRef]);

  const restoreConversationToTail = useCallback((behavior: ScrollBehavior = 'auto') => {
    const anchorId = resolveTailScrollAnchorId({
      latestVisibleEventId: latestVisibleEventIdRef.current,
    });
    if (anchorId) {
      const anchor = document.getElementById(anchorId);
      if (anchor) {
        recordScrollDebugEvent({
          kind: 'write',
          source: 'tail:restoreConversationToTail:anchor',
          behavior,
          detail: {
            anchorId,
          },
        });
        anchor.scrollIntoView({ behavior, block: 'end' });
        return;
      }
    }
    scrollConversationToBottom(behavior);
  }, [latestVisibleEventIdRef, scrollConversationToBottom]);

  const readTailLayoutMetrics = useCallback(() => {
    const anchorId = resolveTailScrollAnchorId({
      latestVisibleEventId: latestVisibleEventIdRef.current,
    });
    const anchor = anchorId ? document.getElementById(anchorId) : null;
    const stream = scrollRef.current;
    const nextMetrics = {
      anchorBottom: anchor ? anchor.getBoundingClientRect().bottom : null,
      scrollHeight: stream?.scrollHeight ?? null,
      viewportHeight: stream?.clientHeight ?? null,
    };
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'tail:readTailLayoutMetrics',
      streamElement: stream,
      detail: {
        anchorId,
        ...nextMetrics,
      },
    });
    return nextMetrics;
  }, [latestVisibleEventIdRef, scrollRef]);

  const syncScrollToBottomButton = useCallback(() => {
    const stream = scrollRef.current;
    if (!stream) {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:syncScrollToBottomButton:no-stream',
      });
      setShowScrollToBottom(false);
      return;
    }
    const nextShowScrollToBottom = hasDetachedTail || !isNearBottom(stream);
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'tail:syncScrollToBottomButton:stream',
      streamElement: stream,
      detail: {
        nextShowScrollToBottom,
      },
    });
    setShowScrollToBottom(nextShowScrollToBottom);
  }, [hasDetachedTail, scrollRef]);

  const handleJumpToBottom = useCallback(() => {
    if (isJumpingToLatestRef.current) {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:handleJumpToBottom:ignored',
      });
      return;
    }
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'tail:handleJumpToBottom:start',
    });
    isJumpingToLatestRef.current = true;
    void jumpToLatestPageWindow({
      shouldStickToBottomRef,
      setShowScrollToBottom,
      resetToLatestWindow,
      restoreConversationToTail,
      behavior: 'smooth',
    }).finally(() => {
      isJumpingToLatestRef.current = false;
    });
  }, [resetToLatestWindow, restoreConversationToTail]);

  // Reset on workspace/new-chat transition
  useEffect(() => {
    if (isWorkspaceHome || isNewChatPlaceholder || !activeChatIdResolved) {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:reset-on-chat-context-change',
        streamElement: scrollRef.current,
        detail: {
          activeChatIdResolved,
          isWorkspaceHome,
          isNewChatPlaceholder,
          hadCancelRef: tailRestoreCancelRef.current !== null,
        },
      });
      if (tailRestoreCancelRef.current) {
        tailRestoreCancelRef.current();
        tailRestoreCancelRef.current = null;
      }
      restoredTailScrollForChatRef.current = null;
      setIsInitialChatEntryPendingReveal(false);
      isTailLayoutSettlingRef.current = false;
      setIsTailLayoutSettling(false);
    }
  }, [activeChatIdResolved, isNewChatPlaceholder, isWorkspaceHome, scrollRef]);

  // Tail-restore settle loop
  useLayoutEffect(() => {
    const wasMidSettle = tailRestoreCancelRef.current !== null;
    const settleAction = resolveTailRestoreSettleAction({
      activeChatIdResolved,
      eventsForChatId,
      hasLoadedCurrentChat,
      isTailRestoreLayoutReady,
      isSettleInFlight: wasMidSettle,
      isTailRestoreHydrated,
      isNewChatPlaceholder,
      isWorkspaceHome,
      restoredForChatId: restoredTailScrollForChatRef.current,
    });
    const loopTransition = resolveTailRestoreLoopTransition({
      wasMidSettle,
      settleAction,
    });

    if (loopTransition.shouldCancelExistingSettle) {
      tailRestoreCancelRef.current?.();
      tailRestoreCancelRef.current = null;
    }

    if (loopTransition.shouldReenablePendingReveal) {
      setIsInitialChatEntryPendingReveal(true);
    }

    if (!loopTransition.shouldRestartSettle) {
      if (loopTransition.shouldResetTailRestoreState) {
        setIsInitialChatEntryPendingReveal(false);
        isTailLayoutSettlingRef.current = false;
        setIsTailLayoutSettling(false);
      }
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:restore-entry:skip',
        streamElement: scrollRef.current,
        detail: {
          activeChatIdResolved,
          eventsForChatId,
          hasLoadedCurrentChat,
          isTailRestoreLayoutReady,
          isTailRestoreHydrated,
          isWorkspaceHome,
          isNewChatPlaceholder,
          restoredForChatId: restoredTailScrollForChatRef.current,
        },
      });
      return;
    }

    recordScrollDebugEvent({
      kind: 'trigger',
      source: settleAction === 'continue'
        ? 'tail:restore-entry:continue-settle'
        : 'tail:restore-entry:eligible',
      detail: {
        instanceId: debugInstanceIdRef.current,
        activeChatIdResolved,
        eventsForChatId,
        hasLoadedCurrentChat,
        isTailRestoreHydrated,
        restoredForChatId: restoredTailScrollForChatRef.current,
      },
    });

    if (settleAction === 'start') {
      restoredTailScrollForChatRef.current = activeChatIdResolved;
    }
    shouldStickToBottomRef.current = true;
    setShowScrollToBottom(false);
    isTailLayoutSettlingRef.current = true;
    setIsTailLayoutSettling(true);

    let finished = false;
    let rafId = 0;
    let timeoutId = 0;
    let stableSinceAt = 0;
    let previousMetrics: ReturnType<typeof readTailLayoutMetrics> | null = null;

    const cancel = () => {
      if (finished) {
        return;
      }
      finished = true;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      if (tailRestoreCancelRef.current === cancel) {
        tailRestoreCancelRef.current = null;
      }
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:settle:cancel',
        streamElement: scrollRef.current,
        detail: {
          activeChatIdResolved,
          stableSinceAt,
        },
      });
    };

    const complete = () => {
      if (finished) {
        return;
      }
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:settle:complete:start',
        streamElement: scrollRef.current,
        detail: {
          activeChatIdResolved,
          stableSinceAt,
        },
      });
      finished = true;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      if (tailRestoreCancelRef.current === cancel) {
        tailRestoreCancelRef.current = null;
      }
      const stream = scrollRef.current;
      if (stream) {
        const top = Math.max(0, stream.scrollHeight - stream.clientHeight);
        recordScrollDebugEvent({
          kind: 'write',
          source: 'tail:settle:complete:stream',
          top,
          behavior: 'auto',
        });
        stream.scrollTop = top;
      }
      setIsInitialChatEntryPendingReveal(false);
      isTailLayoutSettlingRef.current = false;
      setIsTailLayoutSettling(false);
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:settle:complete:done',
        streamElement: scrollRef.current,
        detail: {
          activeChatIdResolved,
        },
      });
    };

    const settle = () => {
      if (finished) {
        return;
      }
      if (shouldStickToBottomRef.current) {
        restoreConversationToTail('auto');
      }
      const nextMetrics = readTailLayoutMetrics();
      if (previousMetrics && hasTailLayoutSettled({
        previousAnchorBottom: previousMetrics.anchorBottom,
        nextAnchorBottom: nextMetrics.anchorBottom,
        previousScrollHeight: previousMetrics.scrollHeight,
        nextScrollHeight: nextMetrics.scrollHeight,
        previousViewportHeight: previousMetrics.viewportHeight,
        nextViewportHeight: nextMetrics.viewportHeight,
      })) {
        if (stableSinceAt === 0) {
          stableSinceAt = window.performance.now();
        }
      } else {
        stableSinceAt = 0;
      }
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:settle:frame',
        streamElement: scrollRef.current,
        detail: {
          activeChatIdResolved,
          shouldStickToBottom: shouldStickToBottomRef.current,
          stableSinceAt,
          previousMetrics,
          nextMetrics,
        },
      });
      previousMetrics = nextMetrics;
      if (stableSinceAt !== 0 && window.performance.now() - stableSinceAt >= TAIL_LAYOUT_SETTLE_IDLE_MS) {
        complete();
        return;
      }
      rafId = window.requestAnimationFrame(settle);
    };

    tailRestoreCancelRef.current = cancel;
    settle();
    timeoutId = window.setTimeout(complete, TAIL_LAYOUT_SETTLE_TIMEOUT_MS);
  }, [
    activeChatIdResolved,
    eventsForChatId,
    hasLoadedCurrentChat,
    isTailRestoreLayoutReady,
    isTailRestoreHydrated,
    isNewChatPlaceholder,
    isWorkspaceHome,
    readTailLayoutMetrics,
    restoreConversationToTail,
    scrollRef,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tailRestoreCancelRef.current) {
        tailRestoreCancelRef.current();
        tailRestoreCancelRef.current = null;
      }
    };
  }, []);

  return {
    isTailLayoutSettling,
    isTailLayoutSettlingRef,
    isInitialChatEntryPendingReveal,
    shouldStickToBottomRef,
    showScrollToBottom,
    setShowScrollToBottom,
    scrollConversationToBottom,
    restoreConversationToTail,
    syncScrollToBottomButton,
    handleJumpToBottom,
  };
}
