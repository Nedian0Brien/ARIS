import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import { createSession, getSessionDetail, runSessionAction } from '@/lib/happy/client';
import type { AgentFlavor } from '@/lib/happy/types';

const DEFAULT_WORKSPACE_TITLE = 'Default workspace';

type PanelRuntimeCleanupTarget = {
  runtimeSessionId: string | null;
};

export type WorkspacePanelRuntimeErrors = Record<string, string>;

type WorkspacePanelRuntimeRow = {
  panelId: string;
  runtimeSessionId: string | null;
  branch: string | null;
  worktreePath: string | null;
  chat: {
    agent: string;
  };
};

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function normalizeAgent(value: string | null | undefined): AgentFlavor {
  return value === 'claude' || value === 'codex' || value === 'gemini' ? value : 'codex';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function sanitizeBranchSegment(input: string): string {
  return input
    .trim()
    .replace(/[^a-zA-Z0-9_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    || 'panel';
}

export function buildWorkspacePanelBranch(input: { projectId: string; panelId: string }): string {
  return [
    'aris',
    'panel',
    sanitizeBranchSegment(input.projectId),
    sanitizeBranchSegment(input.panelId),
  ].join('/');
}

function computeFallbackWorktreePath(projectPath: string, branch: string): string {
  return path.join(projectPath, '.worktrees', branch);
}

async function readRuntimeHostPath(runtimeSessionId: string): Promise<string | null> {
  const detail = await getSessionDetail(runtimeSessionId);
  return normalizeOptionalString(detail.hostPath);
}

async function ensureRuntimeForPanel(input: {
  workspaceId: string;
  projectId: string;
  projectPath: string;
  panel: WorkspacePanelRuntimeRow;
  repairStale: boolean;
}): Promise<void> {
  const branch = normalizeOptionalString(input.panel.branch)
    ?? buildWorkspacePanelBranch({ projectId: input.projectId, panelId: input.panel.panelId });
  const existingRuntimeSessionId = normalizeOptionalString(input.panel.runtimeSessionId);
  const existingWorktreePath = normalizeOptionalString(input.panel.worktreePath);

  if (existingRuntimeSessionId && existingWorktreePath && !input.repairStale) {
    return;
  }

  if (existingRuntimeSessionId && input.repairStale) {
    try {
      const hostPath = await readRuntimeHostPath(existingRuntimeSessionId);
      if (hostPath) {
        await prisma.workspacePanel.update({
          where: {
            workspaceId_panelId: {
              workspaceId: input.workspaceId,
              panelId: input.panel.panelId,
            },
          },
          data: {
            branch,
            worktreePath: hostPath,
          },
        });
        return;
      }
    } catch {
      // Missing runtime sessions are recreated below.
    }
  }

  const runtime = await createSession({
    path: input.projectPath,
    agent: normalizeAgent(input.panel.chat.agent),
    approvalPolicy: 'on-request',
    branch,
  });
  const runtimeBranch = normalizeOptionalString(runtime.branch) ?? branch;
  const worktreePath = await readRuntimeHostPath(runtime.id).catch(() => null)
    ?? computeFallbackWorktreePath(input.projectPath, runtimeBranch);

  await prisma.workspacePanel.update({
    where: {
      workspaceId_panelId: {
        workspaceId: input.workspaceId,
        panelId: input.panel.panelId,
      },
    },
    data: {
      runtimeSessionId: runtime.id,
      branch: runtimeBranch,
      worktreePath,
    },
  });
}

export async function ensureProjectWorkspacePanelRuntimes(input: {
  userId: string;
  projectId: string;
  repairStale?: boolean;
}): Promise<WorkspacePanelRuntimeErrors> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      userId: input.userId,
      projectId: input.projectId,
      title: DEFAULT_WORKSPACE_TITLE,
    },
    select: {
      id: true,
      project: {
        select: {
          path: true,
        },
      },
      panels: {
        select: {
          panelId: true,
          runtimeSessionId: true,
          branch: true,
          worktreePath: true,
          chat: {
            select: {
              agent: true,
            },
          },
        },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      },
    },
  });

  if (!workspace) return {};

  const errors: WorkspacePanelRuntimeErrors = {};
  for (const panel of workspace.panels) {
    try {
      await ensureRuntimeForPanel({
        workspaceId: workspace.id,
        projectId: input.projectId,
        projectPath: workspace.project.path,
        panel,
        repairStale: input.repairStale === true,
      });
    } catch (error) {
      errors[panel.panelId] = errorMessage(error);
    }
  }
  return errors;
}

export async function cleanupWorkspacePanelRuntimes(panels: PanelRuntimeCleanupTarget[]): Promise<void> {
  const runtimeSessionIds = Array.from(new Set(
    panels
      .map((panel) => normalizeOptionalString(panel.runtimeSessionId))
      .filter((runtimeSessionId): runtimeSessionId is string => runtimeSessionId !== null),
  ));

  for (const runtimeSessionId of runtimeSessionIds) {
    await Promise.resolve(runSessionAction(runtimeSessionId, 'kill')).catch(() => undefined);
  }
}
