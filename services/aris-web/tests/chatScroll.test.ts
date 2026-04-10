import { describe, expect, it } from 'vitest';
import {
  resolveMobileWindowScrollTop,
  resolveScrollToBottomTarget,
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
});
