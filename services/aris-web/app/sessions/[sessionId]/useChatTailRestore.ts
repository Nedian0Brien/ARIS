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
  shouldRestoreTailScrollOnChatEntry,
  shouldUseWindowScrollFallback,
} from './chatScroll';
import { recordScrollDebugEvent } from './scrollDebug';

const TAIL_LAYOUT_SETTLE_TIMEOUT_MS = 1200;

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
  isMobileLayoutHydrated: boolean;
  initialShowChatEntryLoading: boolean;
  resetToLatestWindow: () => Promise<void>;
  scrollRef: RefObject<HTMLDivElement | null>;
  latestVisibleEventIdRef: RefObject<string | null>;
};

type ResolveTailRestoreSettleActionInput = {
  activeChatIdResolved: string | null;
  eventsForChatId: string | null;
  hasLoadedCurrentChat: boolean;
  isMobileLayoutHydrated: boolean;
  isSettleInFlight: boolean;
  isTailRestoreHydrated: boolean;
  isNewChatPlaceholder: boolean;
  isWorkspaceHome: boolean;
  restoredForChatId: string | null;
};

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
  input.shouldStickToBottomRef.current = true;
  input.setShowScrollToBottom(false);
  await input.resetToLatestWindow();
  input.restoreConversationToTail(input.behavior ?? 'smooth');
}

export function resolveTailRestoreSettleAction(
  input: ResolveTailRestoreSettleActionInput,
): 'skip' | 'start' | 'continue' {
  if (!input.isMobileLayoutHydrated) {
    return 'skip';
  }

  if (input.isSettleInFlight && input.restoredForChatId === input.activeChatIdResolved) {
    return 'continue';
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
  isMobileLayoutHydrated,
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
    return {
      anchorBottom: anchor ? anchor.getBoundingClientRect().bottom : null,
      scrollHeight: shouldUseWindow ? documentScrollHeight : (stream?.scrollHeight ?? null),
    };
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
      setShowScrollToBottom(!isNearWindowBottom());
      return;
    }
    if (!stream) {
      setShowScrollToBottom(false);
      return;
    }
    setShowScrollToBottom(!isNearBottom(stream));
  }, [isMobileLayout, scrollRef]);

  const handleJumpToBottom = useCallback(() => {
    if (isJumpingToLatestRef.current) {
      return;
    }
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
      if (tailRestoreCancelRef.current) {
        tailRestoreCancelRef.current();
        tailRestoreCancelRef.current = null;
      }
      restoredTailScrollForChatRef.current = null;
      setIsInitialChatEntryPendingReveal(false);
      isTailLayoutSettlingRef.current = false;
      setIsTailLayoutSettling(false);
    }
  }, [activeChatIdResolved, isNewChatPlaceholder, isWorkspaceHome]);

  // Tail-restore settle loop
  useEffect(() => {
    if (!isMobileLayoutHydrated) {
      return;
    }

    const wasMidSettle = tailRestoreCancelRef.current !== null;
    const settleAction = resolveTailRestoreSettleAction({
      activeChatIdResolved,
      eventsForChatId,
      hasLoadedCurrentChat,
      isMobileLayoutHydrated,
      isSettleInFlight: wasMidSettle,
      isTailRestoreHydrated,
      isNewChatPlaceholder,
      isWorkspaceHome,
      restoredForChatId: restoredTailScrollForChatRef.current,
    });

    if (wasMidSettle) {
      tailRestoreCancelRef.current?.();
      tailRestoreCancelRef.current = null;
    }

    if (settleAction === 'skip') {
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
    let stableFrameCount = 0;
    let previousMetrics: ReturnType<typeof readTailLayoutMetrics> | null = null;

    const complete = () => {
      if (finished) {
        return;
      }
      finished = true;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      if (tailRestoreCancelRef.current === complete) {
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
      })) {
        stableFrameCount += 1;
      } else {
        stableFrameCount = 0;
      }
      previousMetrics = nextMetrics;
      if (stableFrameCount >= 2) {
        complete();
        return;
      }
      rafId = window.requestAnimationFrame(settle);
    };

    tailRestoreCancelRef.current = complete;
    settle();
    timeoutId = window.setTimeout(complete, TAIL_LAYOUT_SETTLE_TIMEOUT_MS);
  }, [
    activeChatIdResolved,
    eventsForChatId,
    hasLoadedCurrentChat,
    isMobileLayout,
    isMobileLayoutHydrated,
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
