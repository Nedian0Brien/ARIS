import { prisma } from '@/lib/db/prisma';
import type { SessionSummary } from '@/lib/happy/types';
import { buildDefaultWorkspacePanel } from '@/lib/workspacePanels/defaults';
import { normalizeWorkspacePanelLayout } from '@/lib/workspacePanels/layout';
import type { WorkspacePanelLayout, WorkspacePanelType } from '@/lib/workspacePanels/types';

function normalizeWorkspacePath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim();
  if (!normalized) {
    return '/';
  }
  if (normalized === '/') {
    return '/';
  }
  return normalized.replace(/\/+$/, '');
}

function toActivityEpoch(value: string | null | undefined): number {
  if (!value) {
    return Number.NEGATIVE_INFINITY;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return Number.NEGATIVE_INFINITY;
  }
  return parsed;
}

function dedupeSessionsByPath(sessions: SessionSummary[]): SessionSummary[] {
  const byPath = new Map<string, SessionSummary>();
  for (const session of sessions) {
    const normalizedPath = normalizeWorkspacePath(session.projectName);
    const current = byPath.get(normalizedPath);
    if (!current) {
      byPath.set(normalizedPath, session);
      continue;
    }

    const currentAt = toActivityEpoch(current.lastActivityAt);
    const nextAt = toActivityEpoch(session.lastActivityAt);
    if (nextAt > currentAt || (nextAt === currentAt && session.id > current.id)) {
      byPath.set(normalizedPath, session);
    }
  }
  return [...byPath.values()];
}

export async function syncWorkspacesForUser(userId: string, sessions: SessionSummary[]) {
  const uniqueSessions = dedupeSessionsByPath(sessions);
  if (uniqueSessions.length === 0) {
    return new Map<string, {
      id: string;
      path: string;
      alias: string | null;
      isPinned: boolean;
      lastReadAt: Date | null;
    }>();
  }

  await prisma.$transaction(
    uniqueSessions.map((session) => prisma.workspace.upsert({
      where: {
        userId_path: {
          userId,
          path: normalizeWorkspacePath(session.projectName),
        },
      },
      create: {
        id: session.id,
        userId,
        path: normalizeWorkspacePath(session.projectName),
      },
      update: {
        id: session.id,
      },
    })),
  );

  const paths = uniqueSessions.map((session) => normalizeWorkspacePath(session.projectName));
  const workspaces = await prisma.workspace.findMany({
    where: {
      userId,
      path: { in: paths },
    },
    select: {
      id: true,
      path: true,
      alias: true,
      isPinned: true,
      lastReadAt: true,
    },
  });

  const workspaceByPath = new Map(workspaces.map((workspace) => [workspace.path, workspace]));
  return new Map(uniqueSessions.map((session) => {
    const path = normalizeWorkspacePath(session.projectName);
    const workspace = workspaceByPath.get(path);
    return [
      session.id,
      workspace ?? {
        id: session.id,
        path,
        alias: null,
        isPinned: false,
        lastReadAt: null,
      },
    ];
  }));
}

export async function getWorkspaceById(userId: string, workspaceId: string) {
  return prisma.workspace.findFirst({
    where: {
      id: workspaceId,
      userId,
    },
    select: {
      id: true,
      path: true,
      alias: true,
      isPinned: true,
      lastReadAt: true,
      panelLayoutJson: true,
    },
  });
}

export async function upsertWorkspaceMetadata(input: {
  userId: string;
  workspaceId: string;
  alias?: string | null;
  isPinned?: boolean;
  lastReadAt?: Date | null;
}) {
  const current = await prisma.workspace.findFirst({
    where: {
      id: input.workspaceId,
      userId: input.userId,
    },
    select: {
      id: true,
      path: true,
    },
  });

  if (!current) {
    throw new Error('WORKSPACE_NOT_FOUND');
  }

  return prisma.workspace.update({
    where: { id: input.workspaceId },
    data: {
      ...(input.alias !== undefined && { alias: input.alias }),
      ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
      ...(input.lastReadAt !== undefined && { lastReadAt: input.lastReadAt }),
    },
  });
}

export async function getWorkspacePanelLayout(input: {
  userId: string;
  workspaceId: string;
}): Promise<WorkspacePanelLayout> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: input.workspaceId,
      userId: input.userId,
    },
    select: {
      panelLayoutJson: true,
    },
  });

  if (!workspace) {
    throw new Error('WORKSPACE_NOT_FOUND');
  }

  return normalizeWorkspacePanelLayout(workspace.panelLayoutJson);
}

export async function saveWorkspacePanelLayout(input: {
  userId: string;
  workspaceId: string;
  layout: WorkspacePanelLayout;
}): Promise<WorkspacePanelLayout> {
  const normalized = normalizeWorkspacePanelLayout(input.layout);

  const workspace = await prisma.workspace.updateMany({
    where: {
      id: input.workspaceId,
      userId: input.userId,
    },
    data: {
      panelLayoutJson: normalized,
    },
  });

  if (workspace.count === 0) {
    throw new Error('WORKSPACE_NOT_FOUND');
  }

  return normalized;
}

export async function createWorkspacePanel(input: {
  userId: string;
  workspaceId: string;
  type: WorkspacePanelType;
}): Promise<WorkspacePanelLayout> {
  const current = await getWorkspacePanelLayout({
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const now = new Date().toISOString();
  const nextPanel = buildDefaultWorkspacePanel({
    id: `panel-${input.type}-${Date.now().toString(36)}`,
    type: input.type,
    createdAt: now,
  });

  return saveWorkspacePanelLayout({
    userId: input.userId,
    workspaceId: input.workspaceId,
    layout: {
      version: 1,
      activePage: { kind: 'panel', panelId: nextPanel.id },
      panels: [...current.panels, nextPanel],
    },
  });
}
