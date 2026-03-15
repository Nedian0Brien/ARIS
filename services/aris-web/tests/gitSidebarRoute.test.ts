import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  listSessions: vi.fn(),
  getGitSidebarOverview: vi.fn(),
  getGitSidebarDiff: vi.fn(),
  performGitSidebarAction: vi.fn(),
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/client', () => ({
  listSessions: mocks.listSessions,
}));

vi.mock('@/lib/git/sidebar', () => ({
  getGitSidebarOverview: mocks.getGitSidebarOverview,
  getGitSidebarDiff: mocks.getGitSidebarDiff,
  performGitSidebarAction: mocks.performGitSidebarAction,
}));

import { GET, POST } from '@/app/api/runtime/sessions/[sessionId]/git/route';

describe('git sidebar route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1', role: 'operator' } });
    mocks.listSessions.mockResolvedValue([
      { id: 'session-1', projectName: '/home/ubuntu/project/ARIS' },
    ]);
  });

  it('returns git overview for a session workspace', async () => {
    mocks.getGitSidebarOverview.mockResolvedValue({
      workspacePath: '/home/ubuntu/project/ARIS',
      branch: 'main',
      upstreamBranch: 'origin/main',
      ahead: 0,
      behind: 0,
      isClean: true,
      stagedCount: 0,
      unstagedCount: 0,
      untrackedCount: 0,
      conflictedCount: 0,
      files: [],
    });

    const response = await GET(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/git'),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(mocks.getGitSidebarOverview).toHaveBeenCalledWith('/home/ubuntu/project/ARIS');
    expect(await response.json()).toEqual(expect.objectContaining({ branch: 'main', isClean: true }));
  });

  it('returns file diff when requested', async () => {
    mocks.getGitSidebarDiff.mockResolvedValue('diff --git a/src/app.ts b/src/app.ts');

    const response = await GET(
      new NextRequest(
        'http://localhost/api/runtime/sessions/session-1/git?kind=diff&path=src/app.ts&scope=working',
      ),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(mocks.getGitSidebarDiff).toHaveBeenCalledWith('/home/ubuntu/project/ARIS', 'src/app.ts', 'working');
    expect(await response.json()).toEqual({
      path: 'src/app.ts',
      scope: 'working',
      diff: 'diff --git a/src/app.ts b/src/app.ts',
    });
  });

  it('performs git actions and returns refreshed overview', async () => {
    mocks.performGitSidebarAction.mockResolvedValue({
      overview: {
        workspacePath: '/home/ubuntu/project/ARIS',
        branch: 'feature/chat-sidebar-git',
        upstreamBranch: 'origin/feature/chat-sidebar-git',
        ahead: 1,
        behind: 0,
        isClean: true,
        stagedCount: 0,
        unstagedCount: 0,
        untrackedCount: 0,
        conflictedCount: 0,
        files: [],
      },
      output: '[feature/chat-sidebar-git 1234567] feat: add git sidebar',
    });

    const response = await POST(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/git', {
        method: 'POST',
        body: JSON.stringify({ action: 'commit', message: 'feat: add git sidebar' }),
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    expect(mocks.performGitSidebarAction).toHaveBeenCalledWith('/home/ubuntu/project/ARIS', {
      action: 'commit',
      paths: undefined,
      message: 'feat: add git sidebar',
    });
    expect(await response.json()).toEqual(expect.objectContaining({
      ok: true,
      output: '[feature/chat-sidebar-git 1234567] feat: add git sidebar',
    }));
  });
});
