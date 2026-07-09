import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSummary } from '@/lib/happy/types';

const mocks = vi.hoisted(() => ({
  transaction: vi.fn(),
  projectUpsert: vi.fn(),
  projectFindMany: vi.fn(),
}));

vi.mock('@/lib/db/prisma', () => ({
  prisma: {
    $transaction: mocks.transaction,
    project: {
      upsert: mocks.projectUpsert,
      findMany: mocks.projectFindMany,
    },
  },
}));

vi.mock('@/lib/happy/workspacePanelRuntimes', () => ({
  cleanupWorkspacePanelRuntimes: vi.fn(),
}));

import {
  filterProjectSummaries,
  syncWorkspacesForUser,
} from '@/lib/happy/workspaces';

function session(overrides: Partial<ProjectSummary>): ProjectSummary {
  return {
    id: overrides.id ?? 'project-1',
    agent: overrides.agent ?? 'codex',
    status: overrides.status ?? 'idle',
    lastActivityAt: overrides.lastActivityAt ?? '2026-05-14T00:00:00.000Z',
    riskScore: overrides.riskScore ?? 20,
    projectName: overrides.projectName ?? '/home/ubuntu/project/ARIS',
    approvalPolicy: overrides.approvalPolicy ?? 'on-request',
    ...(overrides.branch !== undefined ? { branch: overrides.branch } : {}),
    ...(overrides.metadata !== undefined ? { metadata: overrides.metadata } : {}),
  };
}

describe('project workspace sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (operations: unknown[]) => operations);
  });

  it('does not treat branch-backed panel runtime projects as Projects', async () => {
    const projectSession = session({
      id: 'project-session',
      lastActivityAt: '2026-05-14T01:00:00.000Z',
    });
    const panelRuntimeProject = session({
      id: 'panel-runtime-session',
      branch: 'aris/panel/project-session/panel-1',
      metadata: {
        runtimeModel: 'chat-stream',
        branch: 'aris/panel/project-session/panel-1',
      },
      lastActivityAt: '2026-05-14T02:00:00.000Z',
    });
    mocks.projectFindMany.mockResolvedValue([{
      id: 'project-session',
      path: '/home/ubuntu/project/ARIS',
      alias: null,
      isPinned: false,
      lastReadAt: null,
    }]);

    const workspaceMap = await syncWorkspacesForUser('user-1', [
      panelRuntimeProject,
      projectSession,
    ]);

    expect(filterProjectSummaries([panelRuntimeProject, projectSession])).toEqual([projectSession]);
    expect(mocks.projectUpsert).toHaveBeenCalledTimes(1);
    expect(mocks.projectUpsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({ id: 'project-session' }),
      update: expect.objectContaining({ id: 'project-session' }),
    }));
    expect(JSON.stringify(mocks.projectUpsert.mock.calls)).not.toContain('panel-runtime-session');
    expect(workspaceMap.has('project-session')).toBe(true);
    expect(workspaceMap.has('panel-runtime-session')).toBe(false);
  });
});
