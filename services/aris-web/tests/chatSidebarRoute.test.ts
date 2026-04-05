import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  listSessionChats: vi.fn(),
  updateSessionChat: vi.fn(),
  getChatSnapshots: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/chats', () => ({
  listSessionChats: mocks.listSessionChats,
  updateSessionChat: mocks.updateSessionChat,
}));

vi.mock('@/lib/happy/client', () => ({
  getChatSnapshots: mocks.getChatSnapshots,
}));

import { GET } from '@/app/api/runtime/sessions/[sessionId]/chats/sidebar/route';

describe('chat sidebar route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.updateSessionChat.mockResolvedValue(undefined);
  });

  it('returns snapshots from backend event stream', async () => {
    mocks.listSessionChats.mockResolvedValue([
      { id: 'chat-1', title: 'Chat 1' },
      { id: 'chat-2', title: 'Chat 2' },
    ]);

    mocks.getChatSnapshots.mockResolvedValue([
      {
        chatId: 'chat-1',
        preview: 'Hello',
        hasEvents: true,
        hasErrorSignal: false,
        latestEventId: 'evt-1',
        latestEventAt: '2026-03-14T08:00:00.000Z',
        latestEventIsUser: false,
        isRunning: false,
      },
      {
        chatId: 'chat-2',
        preview: 'World',
        hasEvents: true,
        hasErrorSignal: false,
        latestEventId: 'evt-2',
        latestEventAt: '2026-03-14T08:01:00.000Z',
        latestEventIsUser: false,
        isRunning: true,
      },
    ]);

    const response = await GET(
      new NextRequest(
        'http://localhost/api/runtime/sessions/session-1/chats/sidebar?chatId=chat-1&chatId=chat-2&activeChatId=chat-2',
      ),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    const payload = await response.json() as { snapshots: Array<{ chatId: string; isRunning: boolean }> };

    expect(mocks.getChatSnapshots).toHaveBeenCalledTimes(1);
    expect(mocks.getChatSnapshots).toHaveBeenCalledWith('session-1', ['chat-1', 'chat-2']);
    expect(payload.snapshots).toEqual([
      expect.objectContaining({ chatId: 'chat-1', isRunning: false, preview: 'Hello' }),
      expect.objectContaining({ chatId: 'chat-2', isRunning: true, preview: 'World' }),
    ]);
  });

  it('falls back to cached fields when backend returns null', async () => {
    mocks.listSessionChats.mockResolvedValue([
      {
        id: 'chat-1',
        title: 'Chat 1',
        latestPreview: 'cached-preview',
        latestEventId: 'evt-old',
        latestEventAt: '2026-03-14T07:00:00.000Z',
        latestEventIsUser: true,
        latestHasErrorSignal: false,
      },
    ]);

    mocks.getChatSnapshots.mockResolvedValue(null);

    const response = await GET(
      new NextRequest(
        'http://localhost/api/runtime/sessions/session-1/chats/sidebar?chatId=chat-1&activeChatId=chat-1',
      ),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    const payload = await response.json() as { snapshots: Array<{ chatId: string; preview: string }> };

    expect(payload.snapshots).toEqual([
      expect.objectContaining({ chatId: 'chat-1', preview: 'cached-preview', isRunning: false }),
    ]);
  });
});
