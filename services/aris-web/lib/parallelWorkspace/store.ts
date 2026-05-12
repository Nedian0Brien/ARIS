import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { prisma } from '@/lib/db/prisma';
import type { AgentFlavor, ApprovalPolicy } from '@/lib/happy/types';
import {
  addPanelToLayout,
  createEmptyParallelWorkspaceLayout,
  normalizeParallelWorkspaceLayout,
  removePanelFromLayout,
  type ParallelPanelRecord,
  type ParallelWorkspaceLayout,
  type ParallelWorkspaceView,
} from './layout';

type ParallelWorkspaceRow = {
  id: string;
  userId: string;
  rootPath: string;
  title: string;
  panelLayoutJson: unknown;
  createdAt: Date;
  updatedAt: Date;
};

const parallelWorkspaceClient = () => (prisma as unknown as {
  parallelWorkspace: {
    create(input: unknown): Promise<ParallelWorkspaceRow>;
    findFirst(input: unknown): Promise<ParallelWorkspaceRow | null>;
    update(input: unknown): Promise<ParallelWorkspaceRow>;
  };
}).parallelWorkspace;

function normalizeRootPath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim();
  if (!normalized) {
    return '';
  }
  if (normalized === '/') {
    return '/';
  }
  return normalized.replace(/\/+$/, '');
}

function deriveWorkspaceTitle(rootPath: string): string {
  const last = path.basename(rootPath);
  return last && last !== '/' ? `${last} 병렬 워크스페이스` : '병렬 워크스페이스';
}

function toView(row: ParallelWorkspaceRow): ParallelWorkspaceView {
  return {
    id: row.id,
    userId: row.userId,
    rootPath: row.rootPath,
    title: row.title,
    layout: normalizeParallelWorkspaceLayout(row.panelLayoutJson, row.rootPath),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function sanitizeBranchName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9/_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned) {
    throw new Error('Invalid branch name');
  }
  return cleaned;
}

export function computeParallelWorktreePath(rootPath: string, branch: string): string {
  return path.join(rootPath, '.worktrees', sanitizeBranchName(branch));
}

export function buildParallelPanelBranch(input: {
  rootPath: string;
  title?: string | null;
  agent: AgentFlavor;
}): string {
  const source = [
    path.basename(input.rootPath) || 'workspace',
    input.title || input.agent,
    randomUUID().slice(0, 8),
  ].join('-');
  const slug = sanitizeBranchName(source.toLowerCase()).slice(0, 80);
  return `parallel/${slug}`;
}

export async function createParallelWorkspace(input: {
  userId: string;
  rootPath: string;
  title?: string | null;
}): Promise<ParallelWorkspaceView> {
  const rootPath = normalizeRootPath(input.rootPath);
  if (!rootPath) {
    throw new Error('Root path is required');
  }
  const title = typeof input.title === 'string' && input.title.trim()
    ? input.title.trim().slice(0, 120)
    : deriveWorkspaceTitle(rootPath);
  const row = await parallelWorkspaceClient().create({
    data: {
      userId: input.userId,
      rootPath,
      title,
      panelLayoutJson: createEmptyParallelWorkspaceLayout(),
    },
  });
  return toView(row);
}

export async function getParallelWorkspace(
  userId: string,
  workspaceId: string,
): Promise<ParallelWorkspaceView | null> {
  const row = await parallelWorkspaceClient().findFirst({
    where: {
      id: workspaceId,
      userId,
    },
  });
  return row ? toView(row) : null;
}

export async function saveParallelWorkspaceLayout(input: {
  userId: string;
  workspaceId: string;
  layout: ParallelWorkspaceLayout;
}): Promise<ParallelWorkspaceView> {
  const current = await getParallelWorkspace(input.userId, input.workspaceId);
  if (!current) {
    throw new Error('PARALLEL_WORKSPACE_NOT_FOUND');
  }
  const normalized = normalizeParallelWorkspaceLayout(input.layout, current.rootPath);
  const row = await parallelWorkspaceClient().update({
    where: {
      id: input.workspaceId,
    },
    data: {
      panelLayoutJson: normalized,
    },
  });
  return toView(row);
}

export async function appendParallelWorkspacePanel(input: {
  userId: string;
  workspaceId: string;
  panel: ParallelPanelRecord;
  afterPanelId?: string | null;
}): Promise<ParallelWorkspaceView> {
  const current = await getParallelWorkspace(input.userId, input.workspaceId);
  if (!current) {
    throw new Error('PARALLEL_WORKSPACE_NOT_FOUND');
  }
  const nextLayout = addPanelToLayout(current.layout, input.panel, input.afterPanelId);
  return saveParallelWorkspaceLayout({
    userId: input.userId,
    workspaceId: input.workspaceId,
    layout: nextLayout,
  });
}

export async function updateParallelWorkspacePanel(input: {
  userId: string;
  workspaceId: string;
  panelId: string;
  title?: string | null;
  active?: boolean;
}): Promise<ParallelWorkspaceView> {
  const current = await getParallelWorkspace(input.userId, input.workspaceId);
  if (!current) {
    throw new Error('PARALLEL_WORKSPACE_NOT_FOUND');
  }
  const panel = current.layout.panels[input.panelId];
  if (!panel) {
    throw new Error('PARALLEL_PANEL_NOT_FOUND');
  }
  const now = new Date().toISOString();
  const title = typeof input.title === 'string' && input.title.trim()
    ? input.title.trim().slice(0, 120)
    : panel.title;
  const nextLayout = normalizeParallelWorkspaceLayout({
    ...current.layout,
    activePanelId: input.active ? input.panelId : current.layout.activePanelId,
    panels: {
      ...current.layout.panels,
      [input.panelId]: {
        ...panel,
        title,
        updatedAt: now,
      },
    },
  }, current.rootPath);

  return saveParallelWorkspaceLayout({
    userId: input.userId,
    workspaceId: input.workspaceId,
    layout: nextLayout,
  });
}

export async function deleteParallelWorkspacePanel(input: {
  userId: string;
  workspaceId: string;
  panelId: string;
}): Promise<ParallelWorkspaceView> {
  const current = await getParallelWorkspace(input.userId, input.workspaceId);
  if (!current) {
    throw new Error('PARALLEL_WORKSPACE_NOT_FOUND');
  }
  const nextLayout = removePanelFromLayout(current.layout, input.panelId, current.rootPath);
  return saveParallelWorkspaceLayout({
    userId: input.userId,
    workspaceId: input.workspaceId,
    layout: nextLayout,
  });
}

export function createParallelPanelRecord(input: {
  sessionId: string;
  title: string;
  rootPath: string;
  branch: string;
  worktreePath?: string | null;
  agent: AgentFlavor;
  approvalPolicy: ApprovalPolicy;
}): ParallelPanelRecord {
  const now = new Date().toISOString();
  return {
    id: `panel_${randomUUID()}`,
    sessionId: input.sessionId,
    title: input.title.trim() || input.branch,
    rootPath: input.rootPath,
    branch: input.branch,
    worktreePath: input.worktreePath || computeParallelWorktreePath(input.rootPath, input.branch),
    agent: input.agent,
    approvalPolicy: input.approvalPolicy,
    createdAt: now,
    updatedAt: now,
  };
}
