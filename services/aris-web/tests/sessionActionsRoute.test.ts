import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  runSessionAction: vi.fn(),
  runWorkspaceDeleteAction: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/client', () => ({
  runSessionAction: mocks.runSessionAction,
  runWorkspaceDeleteAction: mocks.runWorkspaceDeleteAction,
}));

import { POST } from '@/app/api/runtime/sessions/[sessionId]/actions/route';

describe('session actions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
    mocks.runSessionAction.mockResolvedValue({
      sessionId: 'session-1',
      action: 'abort',
      accepted: true,
      message: 'ABORT acknowledged',
      at: '2026-04-15T00:00:00.000Z',
    });
    mocks.runWorkspaceDeleteAction.mockResolvedValue({
      sessionId: 'session-1',
      action: 'kill',
      accepted: true,
      message: 'KILL acknowledged (3 sessions)',
      at: '2026-04-15T00:00:00.000Z',
    });
  });

  it('deletes the full workspace session group for kill requests', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'kill' }),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.runWorkspaceDeleteAction).toHaveBeenCalledWith('session-1');
    expect(mocks.runSessionAction).not.toHaveBeenCalled();
  });

  it('keeps chat-scoped actions on the single target session', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/actions', {
        method: 'POST',
        body: JSON.stringify({ action: 'abort', chatId: 'chat-1' }),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(response.status).toBe(200);
    expect(mocks.runSessionAction).toHaveBeenCalledWith('session-1', 'abort', { chatId: 'chat-1' });
    expect(mocks.runWorkspaceDeleteAction).not.toHaveBeenCalled();
  });
});
