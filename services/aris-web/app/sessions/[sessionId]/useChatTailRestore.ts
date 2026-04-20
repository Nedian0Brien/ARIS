'use client';

import {
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  hasTailLayoutSettled,
  isNearBottom,
  isNearWindowBottom,
  resolveMobileWindowScrollTop,
  resolveScrollToBottomTarget,
  resolveTailScrollAnchorId,
  shouldSkipTailSettleCompletionScroll,
  shouldRestoreTailScrollOnChatEntry,
  shouldUseWindowScrollFallback,
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
  isTailRestoreHydrated: boolean;
  isNewChatPlaceholder: boolean;
  isWorkspaceHome: boolean;
  isMobileLayout: boolean;
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
  shouldRestartSettle: boolean;
  shouldResetTailRestoreState: boolean;
} {
  if (input.settleAction === 'skip') {
    return {
      shouldCancelExistingSettle: input.wasMidSettle,
      shouldRestartSettle: false,
      shouldResetTailRestoreState: input.wasMidSettle,
    };
  }

  return {
    shouldCancelExistingSettle: input.wasMidSettle,
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
  isTailRestoreHydrated,
  isNewChatPlaceholder,
  isWorkspaceHome,
  isMobileLayout,
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
    const documentScrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const stream = scrollRef.current;
    const target = resolveScrollToBottomTarget({
      isMobileLayout,
      keyboardOpen: document.documentElement.dataset.keyboardOpen === 'true',
    });
    const shouldUseWindow = target === 'window' || shouldUseWindowScrollFallback({
      isMobileLayout,
      streamScrollHeight: stream?.scrollHeight ?? null,
      streamClientHeight: stream?.clientHeight ?? null,
      documentScrollHeight,
      viewportHeight,
    });
    if (shouldUseWindow) {
      const top = resolveMobileWindowScrollTop({
        scrollHeight: documentScrollHeight,
        viewportHeight,
      });
      recordScrollDebugEvent({
        kind: 'write',
        source: 'tail:scrollConversationToBottom:window',
        top,
        behavior,
        detail: {
          documentScrollHeight,
          viewportHeight,
        },
      });
      window.scrollTo({ top, behavior });
      return;
    }
    if (!stream) {
      return;
    }
    // scrollHeight - clientHeight = maximum valid scrollTop; explicit for precision
    recordScrollDebugEvent({
      kind: 'write',
      source: 'tail:scrollConversationToBottom:stream',
      top: stream.scrollHeight - stream.clientHeight,
      behavior,
    });
    stream.scrollTo({ top: stream.scrollHeight - stream.clientHeight, behavior });
  }, [isMobileLayout, scrollRef]);

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
    const documentScrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const shouldUseWindow = shouldUseWindowScrollFallback({
      isMobileLayout,
      streamScrollHeight: stream?.scrollHeight ?? null,
      streamClientHeight: stream?.clientHeight ?? null,
      documentScrollHeight,
      viewportHeight,
    });
    const nextMetrics = {
      anchorBottom: anchor ? anchor.getBoundingClientRect().bottom : null,
      scrollHeight: shouldUseWindow ? documentScrollHeight : (stream?.scrollHeight ?? null),
      viewportHeight,
    };
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'tail:readTailLayoutMetrics',
      streamElement: stream,
      detail: {
        anchorId,
        shouldUseWindow,
        ...nextMetrics,
      },
    });
    return nextMetrics;
  }, [isMobileLayout, latestVisibleEventIdRef, scrollRef]);

  const syncScrollToBottomButton = useCallback(() => {
    const stream = scrollRef.current;
    const documentScrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
    const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
    const shouldUseWindow = shouldUseWindowScrollFallback({
      isMobileLayout,
      streamScrollHeight: stream?.scrollHeight ?? null,
      streamClientHeight: stream?.clientHeight ?? null,
      documentScrollHeight,
      viewportHeight,
    });
    if (shouldUseWindow) {
      const nextShowScrollToBottom = !isNearWindowBottom();
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:syncScrollToBottomButton:window',
        streamElement: stream,
        detail: {
          shouldUseWindow,
          nextShowScrollToBottom,
          documentScrollHeight,
          viewportHeight,
        },
      });
      setShowScrollToBottom(nextShowScrollToBottom);
      return;
    }
    if (!stream) {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'tail:syncScrollToBottomButton:no-stream',
        detail: {
          shouldUseWindow,
        },
      });
      setShowScrollToBottom(false);
      return;
    }
    const nextShowScrollToBottom = !isNearBottom(stream);
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'tail:syncScrollToBottomButton:stream',
      streamElement: stream,
      detail: {
        shouldUseWindow,
        nextShowScrollToBottom,
      },
    });
    setShowScrollToBottom(nextShowScrollToBottom);
  }, [isMobileLayout, scrollRef]);

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
  useEffect(() => {
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
      // Bug1 fix: force pixel-perfect alignment after anchor-based settle
      const stream = scrollRef.current;
      const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
      const shouldUseWindow = shouldUseWindowScrollFallback({
        isMobileLayout,
        streamScrollHeight: stream?.scrollHeight ?? null,
        streamClientHeight: stream?.clientHeight ?? null,
        documentScrollHeight: scrollHeight,
        viewportHeight,
      });
      if (shouldUseWindow) {
        if (shouldSkipTailSettleCompletionScroll({
          isMobileLayout,
          shouldUseWindow,
          anchorBottom: previousMetrics?.anchorBottom ?? null,
          viewportHeight,
        })) {
          recordScrollDebugEvent({
            kind: 'trigger',
            source: 'tail:settle:complete:window-skipped',
            detail: {
              anchorBottom: previousMetrics?.anchorBottom ?? null,
              viewportHeight,
            },
          });
        } else {
        recordScrollDebugEvent({
          kind: 'write',
          source: 'tail:settle:complete:window',
          top: Math.max(0, scrollHeight - viewportHeight),
          behavior: 'auto',
          detail: {
            scrollHeight,
            viewportHeight,
          },
        });
        window.scrollTo({ top: Math.max(0, scrollHeight - viewportHeight), behavior: 'auto' });
        }
      } else {
        if (stream) {
          recordScrollDebugEvent({
            kind: 'write',
            source: 'tail:settle:complete:stream',
            top: stream.scrollHeight - stream.clientHeight,
            behavior: 'auto',
          });
          stream.scrollTop = stream.scrollHeight - stream.clientHeight;
        }
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
    isMobileLayout,
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
