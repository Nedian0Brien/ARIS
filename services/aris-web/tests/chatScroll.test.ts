import { describe, expect, it } from 'vitest';
import {
  haveComposerDockMetricsChanged,
  hasResumePhaseSettled,
  hasTailRestoreRenderHydrated,
  hasTailLayoutSettled,
  resolveTailRestoreLayoutReady,
  resolveSessionScrollPhase,
  resolveTailScrollAnchorId,
  resolveMobileWindowScrollTop,
  resolveScrollToBottomTarget,
  resolveChatEntryTailRestorePending,
  shouldPrimeTailRestoreWindow,
  shouldRestoreTailScrollOnChatEntry,
  shouldAutoScrollToBottom,
  shouldResetScrollForChatChange,
  shouldBlockLoadOlder,
  resolveMobileBottomLockState,
  shouldUseManualScrollRestoration,
  shouldUseWindowScrollFallback,
} from '@/app/sessions/[sessionId]/chatScroll';

describe('chatScroll', () => {
  it('keeps mobile scroll-to-bottom enabled even while the virtual keyboard is open', () => {
    expect(resolveScrollToBottomTarget({ isMobileLayout: true, keyboardOpen: false })).toBe('window');
    expect(resolveScrollToBottomTarget({ isMobileLayout: true, keyboardOpen: true })).toBe('window');
    expect(resolveScrollToBottomTarget({ isMobileLayout: false, keyboardOpen: false })).toBe('stream');
  });

  it('computes the bottom window scroll position from document and viewport height', () => {
    expect(resolveMobileWindowScrollTop({ scrollHeight: 2200, viewportHeight: 700 })).toBe(1500);
    expect(resolveMobileWindowScrollTop({ scrollHeight: 640, viewportHeight: 800 })).toBe(0);
  });

  it('resolves the latest visible event into a tail restore anchor id', () => {
    expect(resolveTailScrollAnchorId({ latestVisibleEventId: 'evt-42' })).toBe('event-evt-42');
    expect(resolveTailScrollAnchorId({ latestVisibleEventId: null })).toBeNull();
  });

  it('treats the tail layout as settled only after anchor and scroll height stop moving', () => {
    expect(hasTailLayoutSettled({
      previousAnchorBottom: 820,
      nextAnchorBottom: 820.5,
      previousScrollHeight: 2400,
      nextScrollHeight: 2400.4,
      previousViewportHeight: 712,
      nextViewportHeight: 712.4,
    })).toBe(true);

    expect(hasTailLayoutSettled({
      previousAnchorBottom: null,
      nextAnchorBottom: 820,
      previousScrollHeight: 2400,
      nextScrollHeight: 2400,
      previousViewportHeight: 712,
      nextViewportHeight: 712,
    })).toBe(false);

    expect(hasTailLayoutSettled({
      previousAnchorBottom: 820,
      nextAnchorBottom: 854,
      previousScrollHeight: 2400,
      nextScrollHeight: 2472,
      previousViewportHeight: 712,
      nextViewportHeight: 712,
    })).toBe(false);
  });

  it('keeps the tail settle loop open while the mobile viewport height is still changing', () => {
    expect(hasTailLayoutSettled({
      previousAnchorBottom: 820,
      nextAnchorBottom: 820,
      previousScrollHeight: 2400,
      nextScrollHeight: 2400,
      previousViewportHeight: 712,
      nextViewportHeight: 676,
    })).toBe(false);
  });

  it('treats resume settling as stable only after scroll top and viewport height stop moving', () => {
    expect(hasResumePhaseSettled({
      previousScrollTop: 4069,
      nextScrollTop: 4069.5,
      previousViewportHeight: 712,
      nextViewportHeight: 712.4,
    })).toBe(true);

    expect(hasResumePhaseSettled({
      previousScrollTop: null,
      nextScrollTop: 4069,
      previousViewportHeight: 712,
      nextViewportHeight: 712,
    })).toBe(false);

    expect(hasResumePhaseSettled({
      previousScrollTop: 4069,
      nextScrollTop: 4020,
      previousViewportHeight: 712,
      nextViewportHeight: 712,
    })).toBe(false);

    expect(hasResumePhaseSettled({
      previousScrollTop: 4069,
      nextScrollTop: 4069,
      previousViewportHeight: 712,
      nextViewportHeight: 676,
    })).toBe(false);
  });

  it('waits for deferred stream rendering before treating the tail restore target as hydrated', () => {
    expect(hasTailRestoreRenderHydrated({
      latestVisibleEventId: 'evt-9',
      latestRenderableEventId: 'evt-7',
      expectedStreamItemCount: 5,
      renderedStreamItemCount: 3,
    })).toBe(false);

    expect(hasTailRestoreRenderHydrated({
      latestVisibleEventId: 'evt-9',
      latestRenderableEventId: 'evt-9',
      expectedStreamItemCount: 5,
      renderedStreamItemCount: 4,
    })).toBe(false);

    expect(hasTailRestoreRenderHydrated({
      latestVisibleEventId: 'evt-9',
      latestRenderableEventId: 'evt-9',
      expectedStreamItemCount: 5,
      renderedStreamItemCount: 5,
    })).toBe(true);
  });

  it('resets conversation scroll when switching to a different active chat', () => {
    expect(shouldResetScrollForChatChange({
      previousChatId: 'chat-1',
      nextChatId: 'chat-2',
      isNewChatPlaceholder: false,
    })).toBe(true);

    expect(shouldResetScrollForChatChange({
      previousChatId: 'chat-2',
      nextChatId: 'chat-2',
      isNewChatPlaceholder: false,
    })).toBe(false);

    expect(shouldResetScrollForChatChange({
      previousChatId: 'chat-1',
      nextChatId: null,
      isNewChatPlaceholder: false,
    })).toBe(false);

    expect(shouldResetScrollForChatChange({
      previousChatId: 'chat-1',
      nextChatId: 'chat-2',
      isNewChatPlaceholder: true,
    })).toBe(false);
  });

  it('does not reset conversation scroll while entry tail restore is still pending', () => {
    expect(shouldResetScrollForChatChange({
      previousChatId: 'chat-1',
      nextChatId: 'chat-2',
      isNewChatPlaceholder: false,
      isTailRestorePending: true,
    } as Parameters<typeof shouldResetScrollForChatChange>[0] & { isTailRestorePending: boolean })).toBe(false);
  });

  it('does not auto-scroll to the bottom on workspace home', () => {
    expect(shouldAutoScrollToBottom({
      isWorkspaceHome: true,
      shouldStickToBottom: true,
    })).toBe(false);

    expect(shouldAutoScrollToBottom({
      isWorkspaceHome: false,
      shouldStickToBottom: true,
    })).toBe(true);
  });

  it('suppresses generic auto-scroll while entry tail restore is pending', () => {
    expect(shouldAutoScrollToBottom({
      isWorkspaceHome: false,
      shouldStickToBottom: true,
      isTailRestorePending: true,
    } as Parameters<typeof shouldAutoScrollToBottom>[0] & { isTailRestorePending: boolean })).toBe(false);
  });

  it('restores the chat tail when the active chat finishes hydrating and has not been restored yet', () => {
    expect(shouldRestoreTailScrollOnChatEntry({
      activeChatId: 'chat-2',
      eventsForChatId: 'chat-2',
      hasLoadedCurrentChat: true,
      isTailRestoreHydrated: true,
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: 'chat-1',
    })).toBe(true);
  });

  it('does not restore the chat tail before the active chat data is ready or when already restored', () => {
    expect(shouldRestoreTailScrollOnChatEntry({
      activeChatId: 'chat-2',
      eventsForChatId: 'chat-1',
      hasLoadedCurrentChat: true,
      isTailRestoreHydrated: true,
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: null,
    })).toBe(false);

    expect(shouldRestoreTailScrollOnChatEntry({
      activeChatId: 'chat-2',
      eventsForChatId: 'chat-2',
      hasLoadedCurrentChat: false,
      isTailRestoreHydrated: true,
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: null,
    })).toBe(false);

    expect(shouldRestoreTailScrollOnChatEntry({
      activeChatId: 'chat-2',
      eventsForChatId: 'chat-2',
      hasLoadedCurrentChat: true,
      isTailRestoreHydrated: false,
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: null,
    })).toBe(false);

    expect(shouldRestoreTailScrollOnChatEntry({
      activeChatId: 'chat-2',
      eventsForChatId: 'chat-2',
      hasLoadedCurrentChat: true,
      isTailRestoreHydrated: true,
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: 'chat-2',
    })).toBe(false);
  });

  it('keeps chat-entry tail restore pending until the active mobile chat has actually been restored', () => {
    expect(resolveChatEntryTailRestorePending({
      activeChatId: 'chat-2',
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: null,
      isInitialChatEntryPendingReveal: false,
      isTailLayoutSettling: false,
    })).toBe(true);

    expect(resolveChatEntryTailRestorePending({
      activeChatId: 'chat-2',
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: 'chat-2',
      isInitialChatEntryPendingReveal: false,
      isTailLayoutSettling: false,
    })).toBe(false);

    expect(resolveChatEntryTailRestorePending({
      activeChatId: 'chat-2',
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: 'chat-2',
      isInitialChatEntryPendingReveal: false,
      isTailLayoutSettling: true,
    })).toBe(true);
  });

  it('keeps priming the mobile window until the active chat tail has actually been restored', () => {
    expect(shouldPrimeTailRestoreWindow({
      activeChatId: 'chat-2',
      isTailRestoreHydrated: false,
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: null,
    })).toBe(true);

    expect(shouldPrimeTailRestoreWindow({
      activeChatId: 'chat-2',
      isTailRestoreHydrated: true,
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: null,
    })).toBe(true);

    expect(shouldPrimeTailRestoreWindow({
      activeChatId: 'chat-2',
      isTailRestoreHydrated: false,
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: 'chat-2',
    })).toBe(false);
  });

  it('clamps mobile pixel-perfect scroll top to zero when viewport exceeds document', () => {
    expect(resolveMobileWindowScrollTop({ scrollHeight: 500, viewportHeight: 800 })).toBe(0);
    expect(resolveMobileWindowScrollTop({ scrollHeight: 0, viewportHeight: 0 })).toBe(0);
    expect(resolveMobileWindowScrollTop({ scrollHeight: 1000, viewportHeight: 1000 })).toBe(0);
    expect(resolveMobileWindowScrollTop({ scrollHeight: 1001, viewportHeight: 1000 })).toBe(1);
  });

  it('keeps mobile bottom lock pinned while initial tail restore is still pending', () => {
    expect(resolveMobileBottomLockState({
      isNearBottom: false,
      isTailRestorePending: true,
    })).toEqual({
      shouldStickToBottom: true,
      showScrollToBottom: false,
    });

    expect(resolveMobileBottomLockState({
      isNearBottom: false,
      isTailRestorePending: false,
    })).toEqual({
      shouldStickToBottom: false,
      showScrollToBottom: true,
    });
  });

  it('waits for all mobile scroll-affecting layout inputs before marking tail restore layout ready', () => {
    expect(resolveTailRestoreLayoutReady({
      isMobileLayout: false,
      isMobileLayoutHydrated: false,
      isViewportLayoutReady: false,
      isComposerDockLayoutReady: false,
    })).toBe(false);

    expect(resolveTailRestoreLayoutReady({
      isMobileLayout: false,
      isMobileLayoutHydrated: true,
      isViewportLayoutReady: false,
      isComposerDockLayoutReady: false,
    })).toBe(true);

    expect(resolveTailRestoreLayoutReady({
      isMobileLayout: true,
      isMobileLayoutHydrated: false,
      isViewportLayoutReady: true,
      isComposerDockLayoutReady: true,
    })).toBe(false);

    expect(resolveTailRestoreLayoutReady({
      isMobileLayout: true,
      isMobileLayoutHydrated: true,
      isViewportLayoutReady: false,
      isComposerDockLayoutReady: true,
    })).toBe(false);

    expect(resolveTailRestoreLayoutReady({
      isMobileLayout: true,
      isMobileLayoutHydrated: true,
      isViewportLayoutReady: true,
      isComposerDockLayoutReady: false,
    })).toBe(false);

    expect(resolveTailRestoreLayoutReady({
      isMobileLayout: true,
      isMobileLayoutHydrated: true,
      isViewportLayoutReady: true,
      isComposerDockLayoutReady: true,
    })).toBe(true);
  });

  it('treats composer dock metrics as changed only when scroll-affecting geometry actually moves', () => {
    expect(haveComposerDockMetricsChanged(
      null,
      { height: 98, left: 14, width: 402 },
    )).toBe(true);

    expect(haveComposerDockMetricsChanged(
      { height: 98, left: 14, width: 402 },
      { height: 98, left: 14, width: 402 },
    )).toBe(false);

    expect(haveComposerDockMetricsChanged(
      { height: 98, left: 14, width: 402 },
      { height: 112, left: 14, width: 402 },
    )).toBe(true);
  });

  describe('shouldBlockLoadOlder', () => {
    it('blocks when tail is settling', () => {
      expect(shouldBlockLoadOlder({ isTailLayoutSettling: true, isLoadingOlder: false, hasMoreBefore: true })).toBe(true);
    });
    it('blocks when already loading older', () => {
      expect(shouldBlockLoadOlder({ isTailLayoutSettling: false, isLoadingOlder: true, hasMoreBefore: true })).toBe(true);
    });
    it('blocks when no more before', () => {
      expect(shouldBlockLoadOlder({ isTailLayoutSettling: false, isLoadingOlder: false, hasMoreBefore: false })).toBe(true);
    });
    it('blocks while the chat is resuming from a system-driven scroll restore', () => {
      expect(shouldBlockLoadOlder({
        isTailLayoutSettling: false,
        isLoadingOlder: false,
        hasMoreBefore: true,
        scrollPhase: 'resuming',
      } as Parameters<typeof shouldBlockLoadOlder>[0] & { scrollPhase: 'resuming' })).toBe(true);
    });
    it('blocks while the viewport is still reflowing after resume', () => {
      expect(shouldBlockLoadOlder({
        isTailLayoutSettling: false,
        isLoadingOlder: false,
        hasMoreBefore: true,
        scrollPhase: 'viewport-reflow',
      } as Parameters<typeof shouldBlockLoadOlder>[0] & { scrollPhase: 'viewport-reflow' })).toBe(true);
    });
    it('does not block solely because tail restoration currently owns scroll phase', () => {
      expect(shouldBlockLoadOlder({
        isTailLayoutSettling: false,
        isLoadingOlder: false,
        hasMoreBefore: true,
        scrollPhase: 'restoring-tail',
      } as Parameters<typeof shouldBlockLoadOlder>[0] & { scrollPhase: 'restoring-tail' })).toBe(false);
    });
    it('allows when all conditions clear', () => {
      expect(shouldBlockLoadOlder({ isTailLayoutSettling: false, isLoadingOlder: false, hasMoreBefore: true })).toBe(false);
    });
  });

  describe('shouldUseWindowScrollFallback', () => {
    it('uses window scroll when the document scrolls but the inner stream does not', () => {
      expect(shouldUseWindowScrollFallback({
        isMobileLayout: false,
        streamScrollHeight: 3923,
        streamClientHeight: 3923,
        documentScrollHeight: 5193,
        viewportHeight: 844,
      })).toBe(true);
    });

    it('stays on the stream when the inner stream is actually scrollable', () => {
      expect(shouldUseWindowScrollFallback({
        isMobileLayout: false,
        streamScrollHeight: 3287,
        streamClientHeight: 767,
        documentScrollHeight: 900,
        viewportHeight: 900,
      })).toBe(false);
    });
  });

  describe('shouldUseManualScrollRestoration', () => {
    it('disables browser restoration for an active chat view', () => {
      expect(shouldUseManualScrollRestoration({
        activeChatId: 'chat-1',
        isWorkspaceHome: false,
        isNewChatPlaceholder: false,
      })).toBe(true);
    });

    it('keeps browser restoration for workspace home and new chat views', () => {
      expect(shouldUseManualScrollRestoration({
        activeChatId: null,
        isWorkspaceHome: true,
        isNewChatPlaceholder: false,
      })).toBe(false);

      expect(shouldUseManualScrollRestoration({
        activeChatId: null,
        isWorkspaceHome: false,
        isNewChatPlaceholder: true,
      })).toBe(false);
    });
  });

  describe('resolveSessionScrollPhase', () => {
    it('moves into resuming when the tab or app resumes', () => {
      expect(resolveSessionScrollPhase({
        currentPhase: 'idle',
        event: 'resume-start',
      })).toBe('resuming');
    });

    it('keeps resume ownership while raw scroll events are still arriving', () => {
      expect(resolveSessionScrollPhase({
        currentPhase: 'resuming',
        event: 'scroll-observed',
      })).toBe('resuming');
    });

    it('moves through viewport reflow before returning to idle', () => {
      expect(resolveSessionScrollPhase({
        currentPhase: 'resuming',
        event: 'viewport-changed',
      })).toBe('viewport-reflow');

      expect(resolveSessionScrollPhase({
        currentPhase: 'viewport-reflow',
        event: 'resume-stable',
      })).toBe('idle');
    });
  });
});
