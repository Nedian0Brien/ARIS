import { describe, expect, it } from 'vitest';
import {
  hasTailRestoreRenderHydrated,
  hasTailLayoutSettled,
  resolveTailScrollAnchorId,
  resolveMobileWindowScrollTop,
  resolveScrollToBottomTarget,
  shouldRestoreTailScrollOnChatEntry,
  shouldAutoScrollToBottom,
  shouldResetScrollForChatChange,
  shouldBlockLoadOlder,
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
    })).toBe(true);

    expect(hasTailLayoutSettled({
      previousAnchorBottom: null,
      nextAnchorBottom: 820,
      previousScrollHeight: 2400,
      nextScrollHeight: 2400,
    })).toBe(false);

    expect(hasTailLayoutSettled({
      previousAnchorBottom: 820,
      nextAnchorBottom: 854,
      previousScrollHeight: 2400,
      nextScrollHeight: 2472,
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

  it('clamps mobile pixel-perfect scroll top to zero when viewport exceeds document', () => {
    expect(resolveMobileWindowScrollTop({ scrollHeight: 500, viewportHeight: 800 })).toBe(0);
    expect(resolveMobileWindowScrollTop({ scrollHeight: 0, viewportHeight: 0 })).toBe(0);
    expect(resolveMobileWindowScrollTop({ scrollHeight: 1000, viewportHeight: 1000 })).toBe(0);
    expect(resolveMobileWindowScrollTop({ scrollHeight: 1001, viewportHeight: 1000 })).toBe(1);
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
    it('allows when all conditions clear', () => {
      expect(shouldBlockLoadOlder({ isTailLayoutSettling: false, isLoadingOlder: false, hasMoreBefore: true })).toBe(false);
    });
  });
});
