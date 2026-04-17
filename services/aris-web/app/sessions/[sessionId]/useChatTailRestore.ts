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
} from './chatScroll';

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
  initialShowChatEntryLoading: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  latestVisibleEventIdRef: RefObject<string | null>;
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

export function useChatTailRestore({
  activeChatIdResolved,
  eventsForChatId,
  hasLoadedCurrentChat,
  isTailRestoreHydrated,
  isNewChatPlaceholder,
  isWorkspaceHome,
  isMobileLayout,
  initialShowChatEntryLoading,
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

  const scrollConversationToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const target = resolveScrollToBottomTarget({
      isMobileLayout,
      keyboardOpen: document.documentElement.dataset.keyboardOpen === 'true',
    });
    if (target === 'window') {
      const top = resolveMobileWindowScrollTop({
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      });
      window.scrollTo({ top, behavior });
      return;
    }
    const stream = scrollRef.current;
    if (!stream) {
      return;
    }
    // scrollHeight - clientHeight = maximum valid scrollTop; explicit for precision
    stream.scrollTo({ top: stream.scrollHeight - stream.clientHeight, behavior });
  }, [isMobileLayout, scrollRef]);

  const restoreConversationToTail = useCallback((behavior: ScrollBehavior = 'auto') => {
    const anchorId = resolveTailScrollAnchorId({
      latestVisibleEventId: latestVisibleEventIdRef.current,
    });
    if (anchorId) {
      const anchor = document.getElementById(anchorId);
      if (anchor) {
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
    return {
      anchorBottom: anchor ? anchor.getBoundingClientRect().bottom : null,
      scrollHeight: isMobileLayout
        ? Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
        : (scrollRef.current?.scrollHeight ?? null),
    };
  }, [isMobileLayout, latestVisibleEventIdRef, scrollRef]);

  const syncScrollToBottomButton = useCallback(() => {
    if (isMobileLayout) {
      setShowScrollToBottom(!isNearWindowBottom());
      return;
    }
    const stream = scrollRef.current;
    if (!stream) {
      setShowScrollToBottom(false);
      return;
    }
    setShowScrollToBottom(!isNearBottom(stream));
  }, [isMobileLayout, scrollRef]);

  const handleJumpToBottom = useCallback(() => {
    shouldStickToBottomRef.current = true;
    setShowScrollToBottom(false);
    scrollConversationToBottom('smooth');
  }, [scrollConversationToBottom]);

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
    // If a previous settle is still in progress (e.g. isMobileLayout flipped
    // mid-settle after SSR hydration), the stale closure ran with the wrong
    // layout. Cancel it and reset the guard so this run can re-settle with
    // the current layout.
    const wasMidSettle = tailRestoreCancelRef.current !== null;
    if (wasMidSettle) {
      tailRestoreCancelRef.current?.();
      tailRestoreCancelRef.current = null;
      if (restoredTailScrollForChatRef.current === activeChatIdResolved) {
        restoredTailScrollForChatRef.current = null;
      }
    }

    if (!shouldRestoreTailScrollOnChatEntry({
      activeChatId: activeChatIdResolved,
      eventsForChatId,
      hasLoadedCurrentChat,
      isTailRestoreHydrated,
      isWorkspaceHome,
      isNewChatPlaceholder,
      restoredForChatId: restoredTailScrollForChatRef.current,
    })) {
      return;
    }

    restoredTailScrollForChatRef.current = activeChatIdResolved;
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
      if (isMobileLayout) {
        const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        window.scrollTo({ top: Math.max(0, scrollHeight - viewportHeight), behavior: 'auto' });
      } else {
        const stream = scrollRef.current;
        if (stream) {
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
