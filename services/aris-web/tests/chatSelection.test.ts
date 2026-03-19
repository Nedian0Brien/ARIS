import { describe, expect, it } from 'vitest';
import type { SessionChat } from '@/lib/happy/types';
import { resolveActiveChat, resolveNextSelectedChatId } from '@/app/sessions/[sessionId]/chatSelection';

function makeChat(id: string, overrides: Partial<SessionChat> = {}): SessionChat {
  return {
    id,
    sessionId: 'session-1',
    title: `채팅 ${id}`,
    agent: 'codex',
    model: 'gpt-5.4',
    geminiMode: null,
    modelReasoningEffort: null,
    threadId: null,
    isPinned: false,
    createdAt: '2026-03-19T00:00:00.000Z',
    updatedAt: '2026-03-19T00:00:00.000Z',
    lastActivityAt: '2026-03-19T00:00:00.000Z',
    isDefault: false,
    ...overrides,
  };
}

describe('chatSelection', () => {
  it('returns no active chat while new chat placeholder is visible', () => {
    const chats = [makeChat('chat-1'), makeChat('chat-2')];

    expect(resolveActiveChat(chats, null, true)).toBeNull();
    expect(resolveNextSelectedChatId({
      chats,
      selectedChatId: 'chat-1',
      requestedChatId: 'chat-2',
      isNewChatPlaceholder: true,
    })).toBeNull();
  });

  it('keeps an existing selected chat when placeholder is not visible', () => {
    const chats = [makeChat('chat-1'), makeChat('chat-2')];

    expect(resolveActiveChat(chats, 'chat-2', false)?.id).toBe('chat-2');
    expect(resolveNextSelectedChatId({
      chats,
      selectedChatId: 'chat-2',
      requestedChatId: 'chat-1',
      isNewChatPlaceholder: false,
    })).toBe('chat-2');
  });

  it('falls back to the requested chat or first chat when needed', () => {
    const chats = [makeChat('chat-1'), makeChat('chat-2')];

    expect(resolveNextSelectedChatId({
      chats,
      selectedChatId: null,
      requestedChatId: 'chat-2',
      isNewChatPlaceholder: false,
    })).toBe('chat-2');

    expect(resolveNextSelectedChatId({
      chats,
      selectedChatId: null,
      requestedChatId: 'missing',
      isNewChatPlaceholder: false,
    })).toBe('chat-1');
  });
});
