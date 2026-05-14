import { prisma } from '@/lib/db/prisma';

export class WorkspacePanelExecutionTargetError extends Error {
  constructor(
    readonly code: 'PROJECT_NOT_FOUND' | 'WORKSPACE_PANEL_NOT_FOUND',
    message = code,
  ) {
    super(message);
    this.name = 'WorkspacePanelExecutionTargetError';
  }
}

export type WorkspacePanelExecutionTarget = {
  projectId: string;
  projectPath: string;
  runtimeSessionId: string;
  executionPath: string;
  workspacePanelId: string | null;
  branch: string | null;
  source: 'project' | 'workspace-panel';
};

function normalizeOptionalString(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

async function resolveProjectTarget(input: {
  userId: string;
  projectId: string;
}): Promise<WorkspacePanelExecutionTarget> {
  const project = await prisma.project.findFirst({
    where: {
      id: input.projectId,
      userId: input.userId,
    },
    select: {
      id: true,
      path: true,
    },
  });

  if (!project) {
    throw new WorkspacePanelExecutionTargetError('PROJECT_NOT_FOUND');
  }

  return {
    projectId: project.id,
    projectPath: project.path,
    runtimeSessionId: project.id,
    executionPath: project.path,
    workspacePanelId: null,
    branch: null,
    source: 'project',
  };
}

export async function resolveWorkspacePanelExecutionTarget(input: {
  userId: string;
  projectId: string;
  workspacePanelId?: string | null;
}): Promise<WorkspacePanelExecutionTarget> {
  const workspacePanelId = normalizeOptionalString(input.workspacePanelId);
  if (!workspacePanelId) {
    return resolveProjectTarget({
      userId: input.userId,
      projectId: input.projectId,
    });
  }

  const row = await prisma.workspacePanel.findFirst({
    where: {
      panelId: workspacePanelId,
      workspace: {
        userId: input.userId,
        projectId: input.projectId,
      },
    },
    select: {
      panelId: true,
      runtimeSessionId: true,
      branch: true,
      worktreePath: true,
      workspace: {
        select: {
          projectId: true,
          project: {
            select: {
              path: true,
            },
          },
        },
      },
    },
  });

  if (!row) {
    throw new WorkspacePanelExecutionTargetError('WORKSPACE_PANEL_NOT_FOUND');
  }

  const projectPath = row.workspace.project.path;
  const runtimeSessionId = normalizeOptionalString(row.runtimeSessionId) ?? input.projectId;
  const executionPath = normalizeOptionalString(row.worktreePath) ?? projectPath;

  return {
    projectId: row.workspace.projectId,
    projectPath,
    runtimeSessionId,
    executionPath,
    workspacePanelId: row.panelId,
    branch: normalizeOptionalString(row.branch),
    source: 'workspace-panel',
  };
}

export function readWorkspacePanelIdFromSearchParams(searchParams: URLSearchParams): string | null {
  return normalizeOptionalString(
    searchParams.get('workspacePanelId') ?? searchParams.get('panelId'),
  );
}

export function readWorkspacePanelIdFromRecord(record: Record<string, unknown>): string | null {
  const value = record.workspacePanelId ?? record.panelId;
  return typeof value === 'string' ? normalizeOptionalString(value) : null;
}
