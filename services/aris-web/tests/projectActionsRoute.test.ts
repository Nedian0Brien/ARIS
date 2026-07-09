import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  runProjectAction: vi.fn(),
  runProjectWorkspaceDeleteAction: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/client', () => ({
  runProjectAction: mocks.runProjectAction,
  runProjectWorkspaceDeleteAction: mocks.runProjectWorkspaceDeleteAction,
}));

import { POST } from '@/app/api/runtime/projects/[projectId]/actions/route';

describe('session actions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
    mocks.runProjectAction.mockResolvedValue({
      projectId: 'session-1',
      action: 'abort',
      accepted: true,
      message: 'ABORT acknowledged',
      at: '2026-04-15T00:00:00.000Z',
    });
    mocks.runProjectWorkspaceDeleteAction.mockResolvedValue({
      projectId: 'session-1',
      action: 'kill',
      accepted: true,
      message: 'KILL acknowledged (3 sessions)',
      at: '2026-04-15T00:00:00.000Z',
    });
  });

  it('deletes the full workspace session group for kill requests', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/projects/session-1/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'kill' }),
      }),
      { params: Promise.resolve({ projectId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.runProjectWorkspaceDeleteAction).toHaveBeenCalledWith('session-1');
    expect(mocks.runProjectAction).not.toHaveBeenCalled();
  });

  it('keeps chat-scoped actions on the single target session', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/projects/session-1/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'abort', chatId: 'chat-1' }),
      }),
      { params: Promise.resolve({ projectId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.runProjectAction).toHaveBeenCalledWith('session-1', 'abort', { chatId: 'chat-1' });
    expect(mocks.runProjectWorkspaceDeleteAction).not.toHaveBeenCalled();
  });
});
