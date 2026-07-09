import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  parseProjectPanelState,
  serializeProjectPanelState,
  type ProjectParallelPanelTreeState,
} from '@/app/projectParallelPanels';
import { cleanupWorkspacePanelRuntimes } from '@/lib/happy/workspacePanelRuntimes';

const DEFAULT_WORKSPACE_TITLE = 'Default workspace';

export type ProjectWorkspacePayload = {
  id: string;
  projectId: string;
  title: string;
  layout: ProjectParallelPanelTreeState | null;
  activePanelId: string | null;
  panels: ProjectWorkspacePanelPayload[];
  updatedAt: string;
};

export type ProjectWorkspacePanelPayload = {
  panelId: string;
  chatId: string;
  runtimeProjectId: string | null;
  branch: string | null;
  worktreePath: string | null;
  order: number;
  meta: Prisma.JsonValue | null;
};

export type ProjectWorkspacePanelRuntimePatch = {
  runtimeProjectId?: string | null;
  branch?: string | null;
  worktreePath?: string | null;
  meta?: Prisma.InputJsonValue | null;
};

function jsonToProjectPanelState(
  value: unknown,
  validChatIds?: Set<string>,
): ProjectParallelPanelTreeState | null {
  if (!value) return null;
  const raw = typeof value === 'string' ? value : JSON.stringify(value);
  return parseProjectPanelState(raw, validChatIds);
}

function stateToJson(state: ProjectParallelPanelTreeState): Prisma.InputJsonValue {
  return JSON.parse(serializeProjectPanelState(state)) as Prisma.InputJsonValue;
}

async function assertProjectAccess(input: { userId: string; projectId: string }) {
  const project = await prisma.project.findFirst({
    where: {
      id: input.projectId,
      userId: input.userId,
    },
    select: { id: true },
  });

  if (!project) {
    throw new Error('PROJECT_NOT_FOUND');
  }
}

function toPayload(row: {
  id: string;
  projectId: string;
  title: string;
  layoutJson: Prisma.JsonValue | null;
  activePanelId: string | null;
  updatedAt: Date;
}, validChatIds?: Set<string>, panels: ProjectWorkspacePanelPayload[] = []): ProjectWorkspacePayload {
  const layout = jsonToProjectPanelState(row.layoutJson, validChatIds);
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    layout,
    activePanelId: layout?.activePanelId ?? row.activePanelId ?? null,
    panels,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toPanelPayload(row: {
  panelId: string;
  chatId: string;
  runtimeProjectId: string | null;
  branch: string | null;
  worktreePath: string | null;
  order: number;
  meta: Prisma.JsonValue | null;
}): ProjectWorkspacePanelPayload {
  return {
    panelId: row.panelId,
    chatId: row.chatId,
    runtimeProjectId: row.runtimeProjectId,
    branch: row.branch,
    worktreePath: row.worktreePath,
    order: row.order,
    meta: row.meta,
  };
}

async function listWorkspacePanels(workspaceId: string): Promise<ProjectWorkspacePanelPayload[]> {
  const rows = await prisma.workspacePanel.findMany({
    where: { workspaceId },
    orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
  });
  return rows.map(toPanelPayload);
}

export async function syncWorkspacePanelsForLayout(input: {
  workspaceId: string;
  layout: ProjectParallelPanelTreeState | null;
  panelRuntime?: Record<string, ProjectWorkspacePanelRuntimePatch>;
}): Promise<ProjectWorkspacePanelPayload[]> {
  if (!input.layout) {
    const removedRows = await prisma.workspacePanel.findMany({
      where: { workspaceId: input.workspaceId },
      select: { runtimeProjectId: true },
    });
    await cleanupWorkspacePanelRuntimes(removedRows);
    await prisma.workspacePanel.deleteMany({
      where: { workspaceId: input.workspaceId },
    });
    return [];
  }

  const panels = Object.values(input.layout.panels);
  const panelIds = panels.map((panel) => panel.id);
  const removedRows = await prisma.workspacePanel.findMany({
    where: {
      workspaceId: input.workspaceId,
      panelId: { notIn: panelIds },
    },
    select: { runtimeProjectId: true },
  });
  await cleanupWorkspacePanelRuntimes(removedRows);
  await prisma.workspacePanel.deleteMany({
    where: {
      workspaceId: input.workspaceId,
      panelId: { notIn: panelIds },
    },
  });

  await prisma.$transaction(panels.map((panel, index) => {
    const runtime = input.panelRuntime?.[panel.id] ?? {};
    return prisma.workspacePanel.upsert({
      where: {
        workspaceId_panelId: {
          workspaceId: input.workspaceId,
          panelId: panel.id,
        },
      },
      create: {
        workspaceId: input.workspaceId,
        panelId: panel.id,
        chatId: panel.chatId,
        order: index,
        ...(runtime.runtimeProjectId !== undefined && { runtimeProjectId: runtime.runtimeProjectId }),
        ...(runtime.branch !== undefined && { branch: runtime.branch }),
        ...(runtime.worktreePath !== undefined && { worktreePath: runtime.worktreePath }),
        ...(runtime.meta !== undefined && { meta: runtime.meta ?? Prisma.JsonNull }),
      },
      update: {
        chatId: panel.chatId,
        order: index,
        ...(runtime.runtimeProjectId !== undefined && { runtimeProjectId: runtime.runtimeProjectId }),
        ...(runtime.branch !== undefined && { branch: runtime.branch }),
        ...(runtime.worktreePath !== undefined && { worktreePath: runtime.worktreePath }),
        ...(runtime.meta !== undefined && { meta: runtime.meta ?? Prisma.JsonNull }),
      },
    });
  }));

  return listWorkspacePanels(input.workspaceId);
}

export async function getProjectWorkspace(input: {
  userId: string;
  projectId: string;
  validChatIds?: Set<string>;
}): Promise<ProjectWorkspacePayload> {
  await assertProjectAccess(input);

  const row = await prisma.workspace.upsert({
    where: {
      userId_projectId_title: {
        userId: input.userId,
        projectId: input.projectId,
        title: DEFAULT_WORKSPACE_TITLE,
      },
    },
    create: {
      userId: input.userId,
      projectId: input.projectId,
      title: DEFAULT_WORKSPACE_TITLE,
    },
    update: {},
  });

  return toPayload(row, input.validChatIds, await listWorkspacePanels(row.id));
}

export async function saveProjectWorkspace(input: {
  userId: string;
  projectId: string;
  layout: ProjectParallelPanelTreeState | null;
  validChatIds?: Set<string>;
  panelRuntime?: Record<string, ProjectWorkspacePanelRuntimePatch>;
}): Promise<ProjectWorkspacePayload> {
  await assertProjectAccess(input);

  const normalized = input.layout
    ? jsonToProjectPanelState(stateToJson(input.layout), input.validChatIds)
    : null;

  if (input.layout && !normalized) {
    throw new Error('INVALID_WORKSPACE_LAYOUT');
  }

  const row = await prisma.workspace.upsert({
    where: {
      userId_projectId_title: {
        userId: input.userId,
        projectId: input.projectId,
        title: DEFAULT_WORKSPACE_TITLE,
      },
    },
    create: {
      userId: input.userId,
      projectId: input.projectId,
      title: DEFAULT_WORKSPACE_TITLE,
      layoutJson: normalized ? stateToJson(normalized) : Prisma.JsonNull,
      activePanelId: normalized?.activePanelId ?? null,
    },
    update: {
      layoutJson: normalized ? stateToJson(normalized) : Prisma.JsonNull,
      activePanelId: normalized?.activePanelId ?? null,
    },
  });

  const panels = await syncWorkspacePanelsForLayout({
    workspaceId: row.id,
    layout: normalized,
    panelRuntime: input.panelRuntime,
  });

  return toPayload(row, input.validChatIds, panels);
}
