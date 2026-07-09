import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  createProject: vi.fn(),
  getProjectDetail: vi.fn(),
  runProjectAction: vi.fn(),
  workspaceFindFirst: vi.fn(),
  workspacePanelUpdate: vi.fn(),
}));

vi.mock('@/lib/happy/client', () => ({
  createProject: mocks.createProject,
  getProjectDetail: mocks.getProjectDetail,
  runProjectAction: mocks.runProjectAction,
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
        runtimeProjectId: null,
        branch: null,
        worktreePath: null,
        chat: { agent: 'codex' },
      }],
    });
    mocks.createProject.mockResolvedValue({
      id: 'runtime-panel-1',
      branch: 'aris/panel/project-1/panel-1',
    });
    mocks.getProjectDetail.mockResolvedValue({
      hostPath: '/home/ubuntu/project/ARIS/.worktrees/aris/panel/project-1/panel-1',
    });

    await expect(ensureProjectWorkspacePanelRuntimes({
      userId: 'user-1',
      projectId: 'project-1',
    })).resolves.toEqual({});

    expect(mocks.createProject).toHaveBeenCalledWith({
      path: '/home/ubuntu/project/ARIS',
      agent: 'codex',
      approvalPolicy: 'on-request',
      branch: 'aris/panel/project-1/panel-1',
    });
    expect(mocks.workspacePanelUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        runtimeProjectId: 'runtime-panel-1',
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
        runtimeProjectId: 'stale-runtime',
        branch: 'aris/panel/project-1/panel-1',
        worktreePath: '/missing/worktree',
        chat: { agent: 'claude' },
      }],
    });
    mocks.getProjectDetail.mockRejectedValueOnce(new Error('Session not found'));
    mocks.createProject.mockResolvedValue({
      id: 'runtime-panel-2',
      branch: 'aris/panel/project-1/panel-1',
    });
    mocks.getProjectDetail.mockResolvedValueOnce({
      hostPath: '/home/ubuntu/project/ARIS/.worktrees/aris/panel/project-1/panel-1',
    });

    await expect(ensureProjectWorkspacePanelRuntimes({
      userId: 'user-1',
      projectId: 'project-1',
      repairStale: true,
    })).resolves.toEqual({});

    expect(mocks.createProject).toHaveBeenCalledWith(expect.objectContaining({
      agent: 'claude',
      branch: 'aris/panel/project-1/panel-1',
    }));
    expect(mocks.workspacePanelUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        runtimeProjectId: 'runtime-panel-2',
      }),
    }));
  });

  it('kills runtime projects for panels removed from the layout', async () => {
    await cleanupWorkspacePanelRuntimes([
      { runtimeProjectId: 'runtime-panel-1' },
      { runtimeProjectId: null },
    ]);

    expect(mocks.runProjectAction).toHaveBeenCalledTimes(1);
    expect(mocks.runProjectAction).toHaveBeenCalledWith('runtime-panel-1', 'kill');
  });

  it('returns panel-specific runtime creation failures instead of hiding the cause', async () => {
    mocks.workspaceFindFirst.mockResolvedValue({
      id: 'workspace-1',
      project: { path: '/home/ubuntu/project/ARIS' },
      panels: [{
        panelId: 'panel-1',
        runtimeProjectId: null,
        branch: null,
        worktreePath: null,
        chat: { agent: 'codex' },
      }],
    });
    mocks.createProject.mockRejectedValue(new Error('WORKTREE_CREATE_FAILED: branch collision'));

    await expect(ensureProjectWorkspacePanelRuntimes({
      userId: 'user-1',
      projectId: 'project-1',
    })).resolves.toEqual({
      'panel-1': 'WORKTREE_CREATE_FAILED: branch collision',
    });
    expect(mocks.workspacePanelUpdate).not.toHaveBeenCalled();
  });
});
