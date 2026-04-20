import { describe, expect, it } from 'vitest';

import {
  resolveTailRestoreLoopTransition,
  resolveTailRestoreSettleAction,
} from '@/app/sessions/[sessionId]/useChatTailRestore';

const baseInput = {
  activeChatIdResolved: 'chat-2',
  eventsForChatId: 'chat-2',
  hasLoadedCurrentChat: true,
  isTailRestoreHydrated: true,
  isWorkspaceHome: false,
  isNewChatPlaceholder: false,
};

describe('chat tail restore settle action', () => {
  it('waits for required layout measurements before starting settle, then starts exactly once', () => {
    expect(resolveTailRestoreSettleAction({
      ...baseInput,
      isTailRestoreLayoutReady: false,
      isSettleInFlight: false,
      restoredForChatId: null,
    })).toBe('skip');

    expect(resolveTailRestoreSettleAction({
      ...baseInput,
      isTailRestoreLayoutReady: true,
      isSettleInFlight: false,
      restoredForChatId: null,
    })).toBe('start');

    expect(resolveTailRestoreSettleAction({
      ...baseInput,
      isTailRestoreLayoutReady: true,
      isSettleInFlight: false,
      restoredForChatId: 'chat-2',
    })).toBe('skip');
  });

  it('continues an in-flight settle for the same chat without qualifying as a new restore', () => {
    expect(resolveTailRestoreSettleAction({
      ...baseInput,
      isTailRestoreLayoutReady: true,
      isSettleInFlight: true,
      restoredForChatId: 'chat-2',
    })).toBe('continue');
  });

  it('continues an in-flight settle even when layout readiness temporarily drops again', () => {
    expect(resolveTailRestoreSettleAction({
      ...baseInput,
      isTailRestoreLayoutReady: false,
      isSettleInFlight: true,
      restoredForChatId: 'chat-2',
    })).toBe('continue');
  });

  it('cancels and resets state when an in-flight settle becomes ineligible', () => {
    expect(resolveTailRestoreLoopTransition({
      wasMidSettle: true,
      settleAction: 'skip',
    })).toEqual({
      shouldCancelExistingSettle: true,
      shouldRestartSettle: false,
      shouldResetTailRestoreState: true,
    });
  });

  it('keeps the pre-start state intact while tail restore is still waiting to become eligible', () => {
    expect(resolveTailRestoreLoopTransition({
      wasMidSettle: false,
      settleAction: 'skip',
    })).toEqual({
      shouldCancelExistingSettle: false,
      shouldRestartSettle: false,
      shouldResetTailRestoreState: false,
    });
  });

  it('cancels without force-finishing when an in-flight settle restarts for the same chat', () => {
    expect(resolveTailRestoreLoopTransition({
      wasMidSettle: true,
      settleAction: 'continue',
    })).toEqual({
      shouldCancelExistingSettle: true,
      shouldRestartSettle: true,
      shouldResetTailRestoreState: false,
    });

    expect(resolveTailRestoreLoopTransition({
      wasMidSettle: true,
      settleAction: 'start',
    })).toEqual({
      shouldCancelExistingSettle: true,
      shouldRestartSettle: true,
      shouldResetTailRestoreState: false,
    });
  });
});
