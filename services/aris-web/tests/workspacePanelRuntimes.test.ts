import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createSession: vi.fn(),
  getSessionDetail: vi.fn(),
  runSessionAction: vi.fn(),
  workspaceFindFirst: vi.fn(),
  workspacePanelUpdate: vi.fn(),
}));

vi.mock('@/lib/happy/client', () => ({
  createSession: mocks.createSession,
  getSessionDetail: mocks.getSessionDetail,
  runSessionAction: mocks.runSessionAction,
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    workspace: {
      findFirst: mocks.workspaceFindFirst,
    },
    workspacePanel: {
      update: mocks.workspacePanelUpdate,
    },
  },
}));

import {
  buildWorkspacePanelBranch,
  cleanupWorkspacePanelRuntimes,
  ensureProjectWorkspacePanelRuntimes,
} from '@/lib/happy/workspacePanelRuntimes';

describe('workspace panel runtimes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds deterministic panel branch names that are safe for git worktrees', () => {
    expect(buildWorkspacePanelBranch({
      projectId: 'project/with spaces',
      panelId: 'panel:one',
    })).toBe('aris/panel/project-with-spaces/panel-one');
  });

  it('creates a runtime session and records its worktree for panels missing runtime metadata', async () => {
    mocks.workspaceFindFirst.mockResolvedValue({
      id: 'workspace-1',
      project: { path: '/home/ubuntu/project/ARIS' },
      panels: [{
        panelId: 'panel-1',
        runtimeSessionId: null,
        branch: null,
        worktreePath: null,
        chat: { agent: 'codex' },
      }],
    });
    mocks.createSession.mockResolvedValue({
      id: 'runtime-panel-1',
      branch: 'aris/panel/project-1/panel-1',
    });
    mocks.getSessionDetail.mockResolvedValue({
      hostPath: '/home/ubuntu/project/ARIS/.worktrees/aris/panel/project-1/panel-1',
    });

    await ensureProjectWorkspacePanelRuntimes({
      userId: 'user-1',
      projectId: 'project-1',
    });

    expect(mocks.createSession).toHaveBeenCalledWith({
      path: '/home/ubuntu/project/ARIS',
      agent: 'codex',
      approvalPolicy: 'on-request',
      branch: 'aris/panel/project-1/panel-1',
    });
    expect(mocks.workspacePanelUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        runtimeSessionId: 'runtime-panel-1',
        branch: 'aris/panel/project-1/panel-1',
        worktreePath: '/home/ubuntu/project/ARIS/.worktrees/aris/panel/project-1/panel-1',
      }),
    }));
  });

  it('repairs stale panel runtimes when requested', async () => {
    mocks.workspaceFindFirst.mockResolvedValue({
      id: 'workspace-1',
      project: { path: '/home/ubuntu/project/ARIS' },
      panels: [{
        panelId: 'panel-1',
        runtimeSessionId: 'stale-runtime',
        branch: 'aris/panel/project-1/panel-1',
        worktreePath: '/missing/worktree',
        chat: { agent: 'claude' },
      }],
    });
    mocks.getSessionDetail.mockRejectedValueOnce(new Error('Session not found'));
    mocks.createSession.mockResolvedValue({
      id: 'runtime-panel-2',
      branch: 'aris/panel/project-1/panel-1',
    });
    mocks.getSessionDetail.mockResolvedValueOnce({
      hostPath: '/home/ubuntu/project/ARIS/.worktrees/aris/panel/project-1/panel-1',
    });

    await ensureProjectWorkspacePanelRuntimes({
      userId: 'user-1',
      projectId: 'project-1',
      repairStale: true,
    });

    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      agent: 'claude',
      branch: 'aris/panel/project-1/panel-1',
    }));
    expect(mocks.workspacePanelUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        runtimeSessionId: 'runtime-panel-2',
      }),
    }));
  });

  it('kills runtime sessions for panels removed from the layout', async () => {
    await cleanupWorkspacePanelRuntimes([
      { runtimeSessionId: 'runtime-panel-1' },
      { runtimeSessionId: null },
    ]);

    expect(mocks.runSessionAction).toHaveBeenCalledTimes(1);
    expect(mocks.runSessionAction).toHaveBeenCalledWith('runtime-panel-1', 'kill');
  });
});
