import { describe, expect, it, vi } from 'vitest';
import { jumpToLatestPageWindow } from '@/app/sessions/[sessionId]/useChatTailRestore';

describe('chat tail restore latest-page jump', () => {
  it('resets to the latest page window before restoring the tail', async () => {
    const shouldStickToBottomRef = { current: false };
    const setShowScrollToBottom = vi.fn();
    const resetToLatestWindow = vi.fn(async () => {});
    const restoreConversationToTail = vi.fn();

    await jumpToLatestPageWindow({
      shouldStickToBottomRef,
      setShowScrollToBottom,
      resetToLatestWindow,
      restoreConversationToTail,
      behavior: 'smooth',
    });

    expect(shouldStickToBottomRef.current).toBe(true);
    expect(setShowScrollToBottom).toHaveBeenCalledWith(false);
    expect(resetToLatestWindow).toHaveBeenCalledTimes(1);
    expect(restoreConversationToTail).toHaveBeenCalledWith('smooth');
    expect(resetToLatestWindow.mock.invocationCallOrder[0]).toBeLessThan(
      restoreConversationToTail.mock.invocationCallOrder[0],
    );
  });
});
