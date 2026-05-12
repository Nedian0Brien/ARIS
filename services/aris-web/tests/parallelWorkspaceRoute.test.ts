import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  createSession: vi.fn(),
  getSessionDetail: vi.fn(),
  syncWorkspacesForUser: vi.fn(),
  getParallelWorkspace: vi.fn(),
  appendParallelWorkspacePanel: vi.fn(),
  buildParallelPanelBranch: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/client', () => ({
  createSession: mocks.createSession,
  getSessionDetail: mocks.getSessionDetail,
}));

vi.mock('@/lib/happy/workspaces', () => ({
  syncWorkspacesForUser: mocks.syncWorkspacesForUser,
}));

vi.mock('@/lib/parallelWorkspace/store', async () => {
  const actual = await vi.importActual<typeof import('@/lib/parallelWorkspace/store')>(
    '@/lib/parallelWorkspace/store',
  );
  return {
    ...actual,
    getParallelWorkspace: mocks.getParallelWorkspace,
    appendParallelWorkspacePanel: mocks.appendParallelWorkspacePanel,
    buildParallelPanelBranch: mocks.buildParallelPanelBranch,
  };
});

import { POST } from '@/app/api/parallel-workspaces/[workspaceId]/panels/route';
import { createEmptyParallelWorkspaceLayout } from '@/lib/parallelWorkspace/layout';

describe('parallel workspace panels route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
    mocks.syncWorkspacesForUser.mockResolvedValue(new Map());
    mocks.buildParallelPanelBranch.mockReturnValue('parallel/aris-codex-1234');
    mocks.getParallelWorkspace.mockResolvedValue({
      id: 'workspace-1',
      userId: 'user-1',
      rootPath: '/home/ubuntu/project/ARIS',
      title: 'ARIS 병렬 워크스페이스',
      layout: createEmptyParallelWorkspaceLayout(),
      createdAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z',
    });
    mocks.createSession.mockResolvedValue({
      id: 'session-1',
      projectName: '/home/ubuntu/project/ARIS',
      branch: 'parallel/aris-codex-1234',
      status: 'idle',
      metadata: { runtimeModel: 'chat-stream', branch: 'parallel/aris-codex-1234' },
    });
    mocks.getSessionDetail.mockResolvedValue({
      id: 'session-1',
      agent: 'codex',
      status: 'idle',
      projectName: '/home/ubuntu/project/ARIS',
      branch: 'parallel/aris-codex-1234',
      hostPath: '/home/ubuntu/project/ARIS/.worktrees/parallel/aris-codex-1234',
      lastActivityAt: null,
      approvalPolicy: 'on-request',
    });
    mocks.appendParallelWorkspacePanel.mockImplementation(async (input) => ({
      id: input.workspaceId,
      userId: input.userId,
      rootPath: '/home/ubuntu/project/ARIS',
      title: 'ARIS 병렬 워크스페이스',
      layout: createEmptyParallelWorkspaceLayout(),
      createdAt: '2026-05-12T00:00:00.000Z',
      updatedAt: '2026-05-12T00:00:00.000Z',
    }));
  });

  it('creates a branch-backed session before appending the panel', async () => {
    const response = await POST(
      new NextRequest('http://localhost/api/parallel-workspaces/workspace-1/panels', {
        method: 'POST',
        body: JSON.stringify({ title: 'Refactor A', agent: 'codex' }),
      }),
      { params: Promise.resolve({ workspaceId: 'workspace-1' }) },
    );

    expect(response.status).toBe(201);
    expect(mocks.createSession).toHaveBeenCalledWith({
      path: '/home/ubuntu/project/ARIS',
      agent: 'codex',
      approvalPolicy: 'on-request',
      branch: 'parallel/aris-codex-1234',
    });
    expect(mocks.appendParallelWorkspacePanel).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'workspace-1',
      userId: 'user-1',
      panel: expect.objectContaining({
        sessionId: 'session-1',
        branch: 'parallel/aris-codex-1234',
        worktreePath: '/home/ubuntu/project/ARIS/.worktrees/parallel/aris-codex-1234',
      }),
    }));
  });
});
