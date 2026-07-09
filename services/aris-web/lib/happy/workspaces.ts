import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import type { ProjectSummary } from '@/lib/happy/types';
import { normalizeLocalPreviewConfig } from '@/lib/preview/localPreviewProxy';
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

function projectBranch(project: ProjectSummary): string | null {
  const directBranch = typeof project.branch === 'string' ? project.branch.trim() : '';
  if (directBranch) return directBranch;
  const metadataBranch = typeof project.metadata?.branch === 'string' ? project.metadata.branch.trim() : '';
  return metadataBranch || null;
}

export function isProjectSummary(project: ProjectSummary): boolean {
  return projectBranch(project) === null;
}

export function filterProjectSummaries(projects: ProjectSummary[]): ProjectSummary[] {
  return projects.filter(isProjectSummary);
}

function dedupeProjectsByPath(projects: ProjectSummary[]): ProjectSummary[] {
  const byPath = new Map<string, ProjectSummary>();
  for (const project of filterProjectSummaries(projects)) {
    const normalizedPath = normalizeWorkspacePath(project.projectName);
    const current = byPath.get(normalizedPath);
    if (!current) {
      byPath.set(normalizedPath, project);
      continue;
    }

    const currentAt = toActivityEpoch(current.lastActivityAt);
    const nextAt = toActivityEpoch(project.lastActivityAt);
    if (nextAt > currentAt || (nextAt === currentAt && project.id > current.id)) {
      byPath.set(normalizedPath, project);
    }
  }
  return [...byPath.values()];
}

export async function syncWorkspacesForUser(userId: string, projects: ProjectSummary[]) {
  const uniqueProjects = dedupeProjectsByPath(projects);
  if (uniqueProjects.length === 0) {
    return new Map<string, {
      id: string;
      path: string;
      alias: string | null;
      isPinned: boolean;
      lastReadAt: Date | null;
    }>();
  }

  await prisma.$transaction(
    uniqueProjects.map((project) => prisma.project.upsert({
      where: {
        userId_path: {
          userId,
          path: normalizeWorkspacePath(project.projectName),
        },
      },
      create: {
        id: project.id,
        userId,
        path: normalizeWorkspacePath(project.projectName),
      },
      update: {
        id: project.id,
      },
    })),
  );

  const paths = uniqueProjects.map((project) => normalizeWorkspacePath(project.projectName));
  const workspaces = await prisma.project.findMany({
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
  return new Map(uniqueProjects.map((project) => {
    const path = normalizeWorkspacePath(project.projectName);
    const workspace = workspaceByPath.get(path);
    return [
      project.id,
      workspace ?? {
        id: project.id,
        path,
        alias: null,
        isPinned: false,
        lastReadAt: null,
      },
    ];
  }));
}

export async function getWorkspaceById(userId: string, workspaceId: string) {
  return prisma.project.findFirst({
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
  const current = await prisma.project.findFirst({
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

  return prisma.project.update({
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
  const workspace = await prisma.project.findFirst({
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

  const workspace = await prisma.project.updateMany({
    where: {
      id: input.workspaceId,
      userId: input.userId,
    },
    data: {
      panelLayoutJson: normalized as Prisma.InputJsonValue,
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

export async function updateWorkspacePanel(input: {
  userId: string;
  workspaceId: string;
  panelId: string;
  title?: string;
  config?: Record<string, unknown>;
}): Promise<WorkspacePanelLayout> {
  const current = await getWorkspacePanelLayout({
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const panelIndex = current.panels.findIndex((panel) => panel.id === input.panelId);
  if (panelIndex < 0) {
    throw new Error('PANEL_NOT_FOUND');
  }

  const currentPanel = current.panels[panelIndex];
  const nextPanel = {
    ...currentPanel,
    ...(input.title !== undefined ? { title: input.title } : {}),
    ...(input.config !== undefined
      ? {
          config: currentPanel.type === 'preview'
            ? normalizeLocalPreviewConfig({ ...currentPanel.config, ...input.config })
            : { ...currentPanel.config, ...input.config },
        }
      : {}),
  };

  const nextPanels = [...current.panels];
  nextPanels[panelIndex] = nextPanel;

  return saveWorkspacePanelLayout({
    userId: input.userId,
    workspaceId: input.workspaceId,
    layout: {
      version: 1,
      activePage: current.activePage,
      panels: nextPanels,
    },
  });
}

export async function deleteWorkspacePanel(input: {
  userId: string;
  workspaceId: string;
  panelId: string;
}): Promise<WorkspacePanelLayout> {
  const current = await getWorkspacePanelLayout({
    userId: input.userId,
    workspaceId: input.workspaceId,
  });

  const panelIndex = current.panels.findIndex((panel) => panel.id === input.panelId);
  if (panelIndex < 0) {
    throw new Error('PANEL_NOT_FOUND');
  }

  const nextPanels = current.panels.filter((panel) => panel.id !== input.panelId);
  const fallbackPanel = nextPanels[Math.max(0, panelIndex - 1)] ?? nextPanels[panelIndex] ?? null;
  const nextActivePage: WorkspacePanelLayout['activePage'] = (
    current.activePage.kind === 'panel'
    && current.activePage.panelId === input.panelId
  )
    ? (fallbackPanel ? { kind: 'panel', panelId: fallbackPanel.id } : { kind: 'chat' })
    : current.activePage;

  return saveWorkspacePanelLayout({
    userId: input.userId,
    workspaceId: input.workspaceId,
    layout: {
      version: 1,
      activePage: nextActivePage,
      panels: nextPanels,
    },
  });
}
