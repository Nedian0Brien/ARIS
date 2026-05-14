import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  listSessions: vi.fn(),
  createSession: vi.fn(),
  syncWorkspacesForUser: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/client', () => ({
  listSessions: mocks.listSessions,
  createSession: mocks.createSession,
}));

vi.mock('@/lib/happy/workspaces', () => ({
  syncWorkspacesForUser: mocks.syncWorkspacesForUser,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {},
}));

import { POST } from '@/app/api/runtime/sessions/route';

describe('runtime sessions route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
    mocks.syncWorkspacesForUser.mockResolvedValue(new Map());
  });

  it('creates a fresh session when the only matching path is a legacy session', async () => {
    mocks.listSessions.mockResolvedValue([
      {
        id: 'legacy-session',
        projectName: '/tmp/project',
        status: 'idle',
        metadata: {},
      },
    ]);
    mocks.createSession.mockResolvedValue({
      id: 'new-session',
      projectName: '/tmp/project',
      status: 'idle',
      metadata: { runtimeModel: 'chat-stream' },
    });

    const response = await POST(new NextRequest('http://localhost/api/runtime/sessions', {
      method: 'POST',
      body: JSON.stringify({ path: '/tmp/project' }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.createSession).toHaveBeenCalledTimes(1);
    expect(body.reused).toBe(false);
    expect(body.session.id).toBe('new-session');
  });

  it('reuses an existing chat-stream session for the same path', async () => {
    mocks.listSessions.mockResolvedValue([
      {
        id: 'chat-stream-session',
        projectName: '/tmp/project',
        status: 'idle',
        metadata: { runtimeModel: 'chat-stream' },
      },
    ]);

    const response = await POST(new NextRequest('http://localhost/api/runtime/sessions', {
      method: 'POST',
      body: JSON.stringify({ path: '/tmp/project' }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(body.reused).toBe(true);
    expect(body.session.id).toBe('chat-stream-session');
  });

  it('creates a branch session even when the root path already has an unbranched chat-stream session', async () => {
    mocks.listSessions.mockResolvedValue([
      {
        id: 'root-session',
        projectName: '/tmp/project',
        status: 'idle',
        metadata: { runtimeModel: 'chat-stream' },
      },
    ]);
    mocks.createSession.mockResolvedValue({
      id: 'branch-session',
      projectName: '/tmp/project',
      branch: 'parallel/panel-one',
      status: 'idle',
      metadata: { runtimeModel: 'chat-stream', branch: 'parallel/panel-one' },
    });

    const response = await POST(new NextRequest('http://localhost/api/runtime/sessions', {
      method: 'POST',
      body: JSON.stringify({ path: '/tmp/project', branch: 'parallel/panel-one' }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.createSession).toHaveBeenCalledWith({
      path: '/tmp/project',
      agent: 'claude',
      approvalPolicy: 'on-request',
      branch: 'parallel/panel-one',
    });
    expect(body.reused).toBe(false);
    expect(body.session.id).toBe('branch-session');
  });

  it('reuses an existing branch session only when the branch also matches', async () => {
    mocks.listSessions.mockResolvedValue([
      {
        id: 'branch-session',
        projectName: '/tmp/project',
        branch: 'parallel/panel-one',
        status: 'idle',
        metadata: { runtimeModel: 'chat-stream', branch: 'parallel/panel-one' },
      },
    ]);

    const response = await POST(new NextRequest('http://localhost/api/runtime/sessions', {
      method: 'POST',
      body: JSON.stringify({ path: '/tmp/project', branch: 'parallel/panel-one' }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.createSession).not.toHaveBeenCalled();
    expect(body.reused).toBe(true);
    expect(body.session.id).toBe('branch-session');
  });
});
