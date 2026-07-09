import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  listProjects: vi.fn(),
  createProject: vi.fn(),
  syncWorkspacesForUser: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/client', () => ({
  listProjects: mocks.listProjects,
  createProject: mocks.createProject,
}));

vi.mock('@/lib/happy/workspaces', () => ({
  syncWorkspacesForUser: mocks.syncWorkspacesForUser,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {},
}));

import { POST } from '@/app/api/runtime/projects/route';

describe('runtime projects route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
    mocks.syncWorkspacesForUser.mockResolvedValue(new Map());
  });

  it('creates a fresh project when the only matching path is a legacy project', async () => {
    mocks.listProjects.mockResolvedValue([
      {
        id: 'legacy-session',
        projectName: '/tmp/project',
        status: 'idle',
        metadata: {},
      },
    ]);
    mocks.createProject.mockResolvedValue({
      id: 'new-session',
      projectName: '/tmp/project',
      status: 'idle',
      metadata: { runtimeModel: 'chat-stream' },
    });

    const response = await POST(new NextRequest('http://localhost/api/runtime/projects', {
      method: 'POST',
      body: JSON.stringify({ path: '/tmp/project' }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.createProject).toHaveBeenCalledTimes(1);
    expect(body.reused).toBe(false);
    expect(body.project.id).toBe('new-session');
  });

  it('reuses an existing chat-stream project for the same path', async () => {
    mocks.listProjects.mockResolvedValue([
      {
        id: 'chat-stream-session',
        projectName: '/tmp/project',
        status: 'idle',
        metadata: { runtimeModel: 'chat-stream' },
      },
    ]);

    const response = await POST(new NextRequest('http://localhost/api/runtime/projects', {
      method: 'POST',
      body: JSON.stringify({ path: '/tmp/project' }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(body.reused).toBe(true);
    expect(body.project.id).toBe('chat-stream-session');
  });

  it('creates a branch project even when the root path already has an unbranched chat-stream project', async () => {
    mocks.listProjects.mockResolvedValue([
      {
        id: 'root-session',
        projectName: '/tmp/project',
        status: 'idle',
        metadata: { runtimeModel: 'chat-stream' },
      },
    ]);
    mocks.createProject.mockResolvedValue({
      id: 'branch-session',
      projectName: '/tmp/project',
      branch: 'parallel/panel-one',
      status: 'idle',
      metadata: { runtimeModel: 'chat-stream', branch: 'parallel/panel-one' },
    });

    const response = await POST(new NextRequest('http://localhost/api/runtime/projects', {
      method: 'POST',
      body: JSON.stringify({ path: '/tmp/project', branch: 'parallel/panel-one' }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.createProject).toHaveBeenCalledWith({
      path: '/tmp/project',
      agent: 'claude',
      approvalPolicy: 'on-request',
      branch: 'parallel/panel-one',
    });
    expect(body.reused).toBe(false);
    expect(body.project.id).toBe('branch-session');
  });

  it('reuses an existing branch project only when the branch also matches', async () => {
    mocks.listProjects.mockResolvedValue([
      {
        id: 'branch-session',
        projectName: '/tmp/project',
        branch: 'parallel/panel-one',
        status: 'idle',
        metadata: { runtimeModel: 'chat-stream', branch: 'parallel/panel-one' },
      },
    ]);

    const response = await POST(new NextRequest('http://localhost/api/runtime/projects', {
      method: 'POST',
      body: JSON.stringify({ path: '/tmp/project', branch: 'parallel/panel-one' }),
    }));

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(mocks.createProject).not.toHaveBeenCalled();
    expect(body.reused).toBe(true);
    expect(body.project.id).toBe('branch-session');
  });
});
