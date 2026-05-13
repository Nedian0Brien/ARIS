import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import {
  parseProjectPanelState,
  serializeProjectPanelState,
  type ProjectParallelPanelTreeState,
} from '@/app/projectParallelPanels';

const DEFAULT_WORKSPACE_TITLE = 'Default workspace';

export type ProjectWorkspacePayload = {
  id: string;
  projectId: string;
  title: string;
  layout: ProjectParallelPanelTreeState | null;
  activePanelId: string | null;
  updatedAt: string;
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
  const project = await prisma.workspace.findFirst({
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
}, validChatIds?: Set<string>): ProjectWorkspacePayload {
  const layout = jsonToProjectPanelState(row.layoutJson, validChatIds);
  return {
    id: row.id,
    projectId: row.projectId,
    title: row.title,
    layout,
    activePanelId: layout?.activePanelId ?? row.activePanelId ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function getProjectWorkspace(input: {
  userId: string;
  projectId: string;
  validChatIds?: Set<string>;
}): Promise<ProjectWorkspacePayload> {
  await assertProjectAccess(input);

  const row = await prisma.projectWorkspace.upsert({
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

  return toPayload(row, input.validChatIds);
}

export async function saveProjectWorkspace(input: {
  userId: string;
  projectId: string;
  layout: ProjectParallelPanelTreeState | null;
  validChatIds?: Set<string>;
}): Promise<ProjectWorkspacePayload> {
  await assertProjectAccess(input);

  const normalized = input.layout
    ? jsonToProjectPanelState(stateToJson(input.layout), input.validChatIds)
    : null;

  if (input.layout && !normalized) {
    throw new Error('INVALID_WORKSPACE_LAYOUT');
  }

  const row = await prisma.projectWorkspace.upsert({
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

  return toPayload(row, input.validChatIds);
}
