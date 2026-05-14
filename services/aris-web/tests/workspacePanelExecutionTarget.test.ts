import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  workspacePanelFindFirst: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    project: {
      findFirst: mocks.projectFindFirst,
    },
    workspacePanel: {
      findFirst: mocks.workspacePanelFindFirst,
    },
  },
}));

import {
  resolveWorkspacePanelExecutionTarget,
  WorkspacePanelExecutionTargetError,
} from '@/lib/workspacePanels/executionTarget';

describe('workspace panel execution target', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('falls back to the project path/runtime when no workspace panel is requested', async () => {
    mocks.projectFindFirst.mockResolvedValue({
      id: 'project-1',
      path: '/home/ubuntu/project/ARIS',
    });

    await expect(resolveWorkspacePanelExecutionTarget({
      userId: 'user-1',
      projectId: 'project-1',
    })).resolves.toEqual({
      projectId: 'project-1',
      projectPath: '/home/ubuntu/project/ARIS',
      runtimeSessionId: 'project-1',
      executionPath: '/home/ubuntu/project/ARIS',
      workspacePanelId: null,
      branch: null,
      source: 'project',
    });
  });

  it('uses persisted WorkspacePanel runtime/worktree metadata as the execution target', async () => {
    mocks.workspacePanelFindFirst.mockResolvedValue({
      panelId: 'panel-1',
      runtimeSessionId: 'runtime-panel-1',
      branch: 'parallel/panel-1',
      worktreePath: '/home/ubuntu/project/ARIS/.worktrees/panel-1',
      workspace: {
        projectId: 'project-1',
        project: {
          path: '/home/ubuntu/project/ARIS',
        },
      },
    });

    await expect(resolveWorkspacePanelExecutionTarget({
      userId: 'user-1',
      projectId: 'project-1',
      workspacePanelId: 'panel-1',
    })).resolves.toEqual({
      projectId: 'project-1',
      projectPath: '/home/ubuntu/project/ARIS',
      runtimeSessionId: 'runtime-panel-1',
      executionPath: '/home/ubuntu/project/ARIS/.worktrees/panel-1',
      workspacePanelId: 'panel-1',
      branch: 'parallel/panel-1',
      source: 'workspace-panel',
    });
  });

  it('reports a missing workspace panel distinctly from a missing project', async () => {
    mocks.workspacePanelFindFirst.mockResolvedValue(null);

    await expect(resolveWorkspacePanelExecutionTarget({
      userId: 'user-1',
      projectId: 'project-1',
      workspacePanelId: 'missing-panel',
    })).rejects.toEqual(expect.objectContaining({
      code: 'WORKSPACE_PANEL_NOT_FOUND',
    } satisfies Partial<WorkspacePanelExecutionTargetError>));
  });
});
