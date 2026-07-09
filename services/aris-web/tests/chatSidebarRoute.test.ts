import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  listProjectChats: vi.fn(),
  updateProjectChat: vi.fn(),
  getProjectRuntimeState: vi.fn(),
  listLatestEventsByChat: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/chats', () => ({
  listProjectChats: mocks.listProjectChats,
  updateProjectChat: mocks.updateProjectChat,
}));

vi.mock('@/lib/happy/client', () => ({
  getProjectRuntimeState: mocks.getProjectRuntimeState,
  listLatestEventsByChat: mocks.listLatestEventsByChat,
}));

import { GET } from '@/app/api/runtime/projects/[projectId]/chats/sidebar/route';

describe('chat sidebar route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1' } });
    mocks.listLatestEventsByChat.mockResolvedValue({});
    mocks.updateProjectChat.mockResolvedValue(undefined);
    mocks.getProjectRuntimeState.mockResolvedValue({ isRunning: true });
  });

  it('only fetches runtime state for the active chat', async () => {
    mocks.listProjectChats.mockResolvedValue([
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
        'http://localhost/api/runtime/projects/session-1/chats/sidebar?chatId=chat-1&chatId=chat-2&activeChatId=chat-2',
      ),
      { params: Promise.resolve({ projectId: 'session-1' }) },
    );

    const payload = await response.json() as { snapshots: Array<{ chatId: string; isRunning: boolean }> };

    expect(mocks.getProjectRuntimeState).toHaveBeenCalledTimes(1);
    expect(mocks.getProjectRuntimeState).toHaveBeenCalledWith('session-1', { chatId: 'chat-2' });
    expect(mocks.listLatestEventsByChat).not.toHaveBeenCalled();
    expect(mocks.updateProjectChat).not.toHaveBeenCalled();
    expect(payload.snapshots).toEqual([
      expect.objectContaining({ chatId: 'chat-1', isRunning: false }),
      expect.objectContaining({ chatId: 'chat-2', isRunning: true }),
    ]);
  });
});
