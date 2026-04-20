import { describe, expect, it } from 'vitest';

import { resolveTailRestoreSettleAction } from '@/app/sessions/[sessionId]/useChatTailRestore';

const baseInput = {
  activeChatIdResolved: 'chat-2',
  eventsForChatId: 'chat-2',
  hasLoadedCurrentChat: true,
  isTailRestoreHydrated: true,
  isWorkspaceHome: false,
  isNewChatPlaceholder: false,
};

describe('chat tail restore settle action', () => {
  it('waits for the mobile layout decision before starting settle, then starts exactly once', () => {
    expect(resolveTailRestoreSettleAction({
      ...baseInput,
      isMobileLayoutHydrated: false,
      isSettleInFlight: false,
      restoredForChatId: null,
    })).toBe('skip');

    expect(resolveTailRestoreSettleAction({
      ...baseInput,
      isMobileLayoutHydrated: true,
      isSettleInFlight: false,
      restoredForChatId: null,
    })).toBe('start');

    expect(resolveTailRestoreSettleAction({
      ...baseInput,
      isMobileLayoutHydrated: true,
      isSettleInFlight: false,
      restoredForChatId: 'chat-2',
    })).toBe('skip');
  });

  it('continues an in-flight settle for the same chat without qualifying as a new restore', () => {
    expect(resolveTailRestoreSettleAction({
      ...baseInput,
      isMobileLayoutHydrated: true,
      isSettleInFlight: true,
      restoredForChatId: 'chat-2',
    })).toBe('continue');
  });
});
