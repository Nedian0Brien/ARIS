import type { AgentFlavor, ApprovalPolicy } from '@/lib/happy/types';

export const PARALLEL_WORKSPACE_LAYOUT_VERSION = 1;

export type ParallelPanelRecord = {
  id: string;
  sessionId: string;
  title: string;
  rootPath: string;
  worktreePath: string;
  branch: string;
  agent: AgentFlavor;
  approvalPolicy: ApprovalPolicy;
  createdAt: string;
  updatedAt: string;
};

export type ParallelPanelLeafNode = {
  type: 'leaf';
  panelId: string;
};

export type ParallelPanelSplitNode = {
  type: 'split';
  direction: 'horizontal' | 'vertical';
  ratio: number;
  first: ParallelPanelNode;
  second: ParallelPanelNode;
};

export type ParallelPanelNode = ParallelPanelLeafNode | ParallelPanelSplitNode;

export type ParallelWorkspaceLayout = {
  version: typeof PARALLEL_WORKSPACE_LAYOUT_VERSION;
  activePanelId: string | null;
  layout: ParallelPanelNode | null;
  panels: Record<string, ParallelPanelRecord>;
};

export type ParallelWorkspaceView = {
  id: string;
  userId: string;
  rootPath: string;
  title: string;
  layout: ParallelWorkspaceLayout;
  createdAt: string;
  updatedAt: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizeAgent(value: unknown): AgentFlavor {
  return value === 'claude' || value === 'codex' || value === 'gemini' ? value : 'codex';
}

function normalizeApprovalPolicy(value: unknown): ApprovalPolicy {
  return value === 'on-request' || value === 'on-failure' || value === 'never' || value === 'yolo'
    ? value
    : 'on-request';
}

function normalizePanelRecord(value: unknown, fallbackRootPath: string): ParallelPanelRecord | null {
  const record = isRecord(value) ? value : null;
  if (!record) {
    return null;
  }
  const id = asString(record.id);
  const sessionId = asString(record.sessionId);
  const branch = asString(record.branch);
  const worktreePath = asString(record.worktreePath);
  if (!id || !sessionId || !branch || !worktreePath) {
    return null;
  }
  const now = new Date().toISOString();
  return {
    id,
    sessionId,
    title: asString(record.title) ?? id,
    rootPath: asString(record.rootPath) ?? fallbackRootPath,
    worktreePath,
    branch,
    agent: normalizeAgent(record.agent),
    approvalPolicy: normalizeApprovalPolicy(record.approvalPolicy),
    createdAt: asString(record.createdAt) ?? now,
    updatedAt: asString(record.updatedAt) ?? now,
  };
}

function normalizeNode(value: unknown, panels: Record<string, ParallelPanelRecord>): ParallelPanelNode | null {
  const record = isRecord(value) ? value : null;
  if (!record) {
    return null;
  }
  if (record.type === 'leaf') {
    const panelId = asString(record.panelId);
    return panelId && panels[panelId] ? { type: 'leaf', panelId } : null;
  }
  if (record.type !== 'split') {
    return null;
  }
  const first = normalizeNode(record.first, panels);
  const second = normalizeNode(record.second, panels);
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  const direction = record.direction === 'vertical' ? 'vertical' : 'horizontal';
  const rawRatio = typeof record.ratio === 'number' ? record.ratio : 0.5;
  const ratio = Math.min(0.8, Math.max(0.2, rawRatio));
  return { type: 'split', direction, ratio, first, second };
}

function collectPanelIds(node: ParallelPanelNode | null, output = new Set<string>()): Set<string> {
  if (!node) {
    return output;
  }
  if (node.type === 'leaf') {
    output.add(node.panelId);
    return output;
  }
  collectPanelIds(node.first, output);
  collectPanelIds(node.second, output);
  return output;
}

export function findFirstPanelId(node: ParallelPanelNode | null): string | null {
  if (!node) {
    return null;
  }
  if (node.type === 'leaf') {
    return node.panelId;
  }
  return findFirstPanelId(node.first) ?? findFirstPanelId(node.second);
}

export function createEmptyParallelWorkspaceLayout(): ParallelWorkspaceLayout {
  return {
    version: PARALLEL_WORKSPACE_LAYOUT_VERSION,
    activePanelId: null,
    layout: null,
    panels: {},
  };
}

export function normalizeParallelWorkspaceLayout(
  raw: unknown,
  fallbackRootPath: string,
): ParallelWorkspaceLayout {
  const record = isRecord(raw) ? raw : null;
  if (!record) {
    return createEmptyParallelWorkspaceLayout();
  }
  const rawPanels = isRecord(record.panels) ? record.panels : {};
  const panels = Object.fromEntries(
    Object.entries(rawPanels)
      .map(([key, value]) => [key, normalizePanelRecord(value, fallbackRootPath)] as const)
      .filter((entry): entry is [string, ParallelPanelRecord] => entry[1] !== null),
  );
  let layout = normalizeNode(record.layout, panels);
  if (!layout) {
    const firstPanel = Object.keys(panels)[0];
    layout = firstPanel ? { type: 'leaf', panelId: firstPanel } : null;
  }
  const referenced = collectPanelIds(layout);
  const referencedPanels = Object.fromEntries(
    Object.entries(panels).filter(([panelId]) => referenced.has(panelId)),
  );
  const activePanelId = asString(record.activePanelId);
  const firstPanelId = findFirstPanelId(layout);

  return {
    version: PARALLEL_WORKSPACE_LAYOUT_VERSION,
    activePanelId: activePanelId && referenced.has(activePanelId) ? activePanelId : firstPanelId,
    layout,
    panels: referencedPanels,
  };
}

function splitAfterPanel(
  node: ParallelPanelNode,
  targetPanelId: string,
  newPanelId: string,
): ParallelPanelNode {
  if (node.type === 'leaf') {
    if (node.panelId !== targetPanelId) {
      return node;
    }
    return {
      type: 'split',
      direction: 'horizontal',
      ratio: 0.5,
      first: node,
      second: { type: 'leaf', panelId: newPanelId },
    };
  }
  return {
    ...node,
    first: splitAfterPanel(node.first, targetPanelId, newPanelId),
    second: splitAfterPanel(node.second, targetPanelId, newPanelId),
  };
}

export function addPanelToLayout(
  layout: ParallelWorkspaceLayout,
  panel: ParallelPanelRecord,
  afterPanelId?: string | null,
): ParallelWorkspaceLayout {
  const panels = { ...layout.panels, [panel.id]: panel };
  const current = normalizeParallelWorkspaceLayout({ ...layout, panels }, panel.rootPath);
  const shouldSplitExistingLayout = Boolean(layout.layout) && !layout.panels[panel.id];
  const targetPanelId = afterPanelId && current.panels[afterPanelId]
    ? afterPanelId
    : current.activePanelId;
  const nextNode = shouldSplitExistingLayout && current.layout && targetPanelId
    ? splitAfterPanel(current.layout, targetPanelId, panel.id)
    : { type: 'leaf' as const, panelId: panel.id };

  return normalizeParallelWorkspaceLayout({
    version: PARALLEL_WORKSPACE_LAYOUT_VERSION,
    activePanelId: panel.id,
    layout: nextNode,
    panels,
  }, panel.rootPath);
}

function removePanelNode(node: ParallelPanelNode | null, panelId: string): ParallelPanelNode | null {
  if (!node) {
    return null;
  }
  if (node.type === 'leaf') {
    return node.panelId === panelId ? null : node;
  }
  const first = removePanelNode(node.first, panelId);
  const second = removePanelNode(node.second, panelId);
  if (!first) {
    return second;
  }
  if (!second) {
    return first;
  }
  return { ...node, first, second };
}

export function removePanelFromLayout(
  layout: ParallelWorkspaceLayout,
  panelId: string,
  fallbackRootPath: string,
): ParallelWorkspaceLayout {
  const panels = { ...layout.panels };
  delete panels[panelId];
  const nextNode = removePanelNode(layout.layout, panelId);
  return normalizeParallelWorkspaceLayout({
    ...layout,
    activePanelId: layout.activePanelId === panelId ? null : layout.activePanelId,
    layout: nextNode,
    panels,
  }, fallbackRootPath);
}
