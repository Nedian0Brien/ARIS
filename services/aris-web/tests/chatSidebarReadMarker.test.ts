import { describe, expect, it } from 'vitest';
import { resolveNextChatReadMarker } from '@/app/sessions/[sessionId]/chatSidebar';

describe('resolveNextChatReadMarker', () => {
  it('marks the active chat as read even when the scroll-to-bottom button is visible', () => {
    expect(
      resolveNextChatReadMarker({
        activeChatId: 'chat-1',
        eventsForChatId: 'chat-1',
        latestEventId: 'evt-2',
        hasScrollToBottomButton: true,
      }),
    ).toBe('evt-2');
  });
});
