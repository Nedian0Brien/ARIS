import { describe, expect, it } from 'vitest';
import {
  hasTailLayoutSettled,
  resolveTailScrollAnchorId,
  resolveMobileWindowScrollTop,
  resolveScrollToBottomTarget,
  shouldRestoreTailScrollOnChatEntry,
  shouldAutoScrollToBottom,
  shouldResetScrollForChatChange,
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
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: null,
    })).toBe(false);

    expect(shouldRestoreTailScrollOnChatEntry({
      activeChatId: 'chat-2',
      eventsForChatId: 'chat-2',
      hasLoadedCurrentChat: false,
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: null,
    })).toBe(false);

    expect(shouldRestoreTailScrollOnChatEntry({
      activeChatId: 'chat-2',
      eventsForChatId: 'chat-2',
      hasLoadedCurrentChat: true,
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      restoredForChatId: 'chat-2',
    })).toBe(false);
  });
});
