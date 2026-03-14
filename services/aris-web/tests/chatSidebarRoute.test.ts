import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  listSessionChats: vi.fn(),
  updateSessionChat: vi.fn(),
  getSessionRuntimeState: vi.fn(),
  listLatestEventsByChat: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/chats', () => ({
  listSessionChats: mocks.listSessionChats,
  updateSessionChat: mocks.updateSessionChat,
}));

vi.mock('@/lib/happy/client', () => ({
  getSessionRuntimeState: mocks.getSessionRuntimeState,
  listLatestEventsByChat: mocks.listLatestEventsByChat,
}));

import { GET } from '@/app/api/runtime/sessions/[sessionId]/chats/sidebar/route';

describe('chat sidebar route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.listLatestEventsByChat.mockResolvedValue({});
    mocks.updateSessionChat.mockResolvedValue(undefined);
    mocks.getSessionRuntimeState.mockResolvedValue({ isRunning: true });
  });

  it('only fetches runtime state for the active chat', async () => {
    mocks.listSessionChats.mockResolvedValue([
      {
        id: 'chat-1',
        title: 'Chat 1',
        latestPreview: 'cached',
        latestEventId: 'evt-1',
        latestEventAt: '2026-03-14T08:00:00.000Z',
        latestEventIsUser: false,
        latestHasErrorSignal: false,
      },
      {
        id: 'chat-2',
        title: 'Chat 2',
        latestPreview: 'cached',
        latestEventId: 'evt-2',
        latestEventAt: '2026-03-14T08:01:00.000Z',
        latestEventIsUser: false,
        latestHasErrorSignal: false,
      },
    ]);

    const response = await GET(
      new NextRequest(
        'http://localhost/api/runtime/sessions/session-1/chats/sidebar?chatId=chat-1&chatId=chat-2&activeChatId=chat-2',
      ),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    const payload = await response.json() as { snapshots: Array<{ chatId: string; isRunning: boolean }> };

    expect(mocks.getSessionRuntimeState).toHaveBeenCalledTimes(1);
    expect(mocks.getSessionRuntimeState).toHaveBeenCalledWith('session-1', { chatId: 'chat-2' });
    expect(payload.snapshots).toEqual([
      expect.objectContaining({ chatId: 'chat-1', isRunning: false }),
      expect.objectContaining({ chatId: 'chat-2', isRunning: true }),
    ]);
  });
});
