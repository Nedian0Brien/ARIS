export type ProjectParallelPanelDropEdge = 'left' | 'right' | 'top' | 'bottom' | 'center';

export type ProjectParallelPanelNode = ProjectParallelPanelLeafNode | ProjectParallelPanelSplitNode;

export type ProjectParallelPanelSplitDirection = 'horizontal' | 'vertical';

export type ProjectParallelPanelCreateId = () => string;

export interface ProjectParallelPanel {
  id: string;
  chatId: string;
}

export interface ProjectParallelPanelLeafNode {
  type: 'leaf';
  panelId: string;
}

export interface ProjectParallelPanelSplitNode {
  type: 'hsplit' | 'vsplit';
  ratio: number;
  children: [ProjectParallelPanelNode, ProjectParallelPanelNode];
}

export interface ProjectParallelPanelTreeState {
  layout: ProjectParallelPanelNode;
  panels: Record<string, ProjectParallelPanel>;
  activePanelId: string;
}

export interface ProjectPanelDropRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

const PROJECT_PANEL_EDGE_THRESHOLD = 0.25;
const PROJECT_PANEL_MIN_RATIO = 0.15;
const PROJECT_PANEL_MAX_RATIO = 0.85;

export function computeProjectPanelDropEdge(
  clientX: number,
  clientY: number,
  rect: ProjectPanelDropRect,
): ProjectParallelPanelDropEdge {
  const x = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
  const y = rect.height > 0 ? (clientY - rect.top) / rect.height : 0.5;
  const distLeft = x;
  const distRight = 1 - x;
  const distTop = y;
  const distBottom = 1 - y;
  const minEdgeDist = Math.min(distLeft, distRight, distTop, distBottom);

  if (minEdgeDist >= PROJECT_PANEL_EDGE_THRESHOLD) return 'center';
  if (minEdgeDist === distLeft) return 'left';
  if (minEdgeDist === distRight) return 'right';
  if (minEdgeDist === distTop) return 'top';
  return 'bottom';
}

export function createProjectPanelTree(
  chatId: string,
  createId: ProjectParallelPanelCreateId,
): ProjectParallelPanelTreeState {
  const panelId = createId();
  return {
    activePanelId: panelId,
    panels: {
      [panelId]: { id: panelId, chatId },
    },
    layout: { type: 'leaf', panelId },
  };
}

export function collectProjectPanelIds(node: ProjectParallelPanelNode): string[] {
  if (node.type === 'leaf') return [node.panelId];
  return [
    ...collectProjectPanelIds(node.children[0]),
    ...collectProjectPanelIds(node.children[1]),
  ];
}

export function findFirstProjectPanelId(node: ProjectParallelPanelNode): string {
  if (node.type === 'leaf') return node.panelId;
  return findFirstProjectPanelId(node.children[0]);
}

export function containsProjectPanel(node: ProjectParallelPanelNode, panelId: string): boolean {
  if (node.type === 'leaf') return node.panelId === panelId;
  return containsProjectPanel(node.children[0], panelId) || containsProjectPanel(node.children[1], panelId);
}

export function findProjectPanelByChatId(
  panels: Record<string, ProjectParallelPanel>,
  chatId: string,
): ProjectParallelPanel | null {
  return Object.values(panels).find((panel) => panel.chatId === chatId) ?? null;
}

export function applyProjectChatDropToPanel(
  state: ProjectParallelPanelTreeState,
  targetPanelId: string,
  chatId: string,
  edge: ProjectParallelPanelDropEdge,
  createId: ProjectParallelPanelCreateId,
): ProjectParallelPanelTreeState | null {
  if (!state.panels[targetPanelId] || !containsProjectPanel(state.layout, targetPanelId)) return null;
  const existingPanel = findProjectPanelByChatId(state.panels, chatId);
  if (existingPanel?.id === targetPanelId) {
    return { ...state, activePanelId: targetPanelId };
  }

  if (edge === 'center') {
    return replaceTargetPanelChat(state, targetPanelId, chatId, existingPanel?.id ?? null);
  }

  if (existingPanel) {
    return moveProjectPanelNode(state, existingPanel.id, targetPanelId, edge);
  }

  const newPanelId = createId();
  const splitNode = buildProjectSplitNode(
    { type: 'leaf', panelId: targetPanelId },
    { type: 'leaf', panelId: newPanelId },
    edge,
  );
  const layout = replaceProjectPanelLeaf(state.layout, targetPanelId, splitNode);
  if (!layout) return null;

  return normalizeProjectPanelState({
    activePanelId: newPanelId,
    layout,
    panels: {
      ...state.panels,
      [newPanelId]: { id: newPanelId, chatId },
    },
  });
}

export function moveProjectPanelNode(
  state: ProjectParallelPanelTreeState,
  sourcePanelId: string,
  targetPanelId: string,
  edge: ProjectParallelPanelDropEdge,
): ProjectParallelPanelTreeState | null {
  if (sourcePanelId === targetPanelId) return { ...state, activePanelId: targetPanelId };
  const sourcePanel = state.panels[sourcePanelId];
  const targetPanel = state.panels[targetPanelId];
  if (!sourcePanel || !targetPanel) return null;
  if (!containsProjectPanel(state.layout, sourcePanelId) || !containsProjectPanel(state.layout, targetPanelId)) return null;

  if (edge === 'center') {
    return {
      ...state,
      activePanelId: targetPanelId,
      panels: {
        ...state.panels,
        [sourcePanelId]: { ...sourcePanel, chatId: targetPanel.chatId },
        [targetPanelId]: { ...targetPanel, chatId: sourcePanel.chatId },
      },
    };
  }

  const withoutSource = removeProjectPanelLeaf(state.layout, sourcePanelId);
  if (!withoutSource || !containsProjectPanel(withoutSource, targetPanelId)) return null;

  const splitNode = buildProjectSplitNode(
    { type: 'leaf', panelId: targetPanelId },
    { type: 'leaf', panelId: sourcePanelId },
    edge,
  );
  const layout = replaceProjectPanelLeaf(withoutSource, targetPanelId, splitNode);
  if (!layout) return null;

  return normalizeProjectPanelState({
    ...state,
    activePanelId: sourcePanelId,
    layout,
  });
}

export function resizeProjectPanelSplit(
  state: ProjectParallelPanelTreeState,
  leftAnchorId: string,
  rightAnchorId: string,
  ratio: number,
): ProjectParallelPanelTreeState {
  return {
    ...state,
    layout: updateProjectSplitRatio(state.layout, leftAnchorId, rightAnchorId, clampProjectPanelRatio(ratio)),
  };
}

export function closeProjectPanel(
  state: ProjectParallelPanelTreeState,
  panelId: string,
): ProjectParallelPanelTreeState | null {
  if (!state.panels[panelId] || Object.keys(state.panels).length <= 1) return state;
  const layout = removeProjectPanelLeaf(state.layout, panelId);
  if (!layout) return null;
  const panels = { ...state.panels };
  delete panels[panelId];
  const activePanelId = panels[state.activePanelId]
    ? state.activePanelId
    : findFirstProjectPanelId(layout);

  return normalizeProjectPanelState({
    activePanelId,
    layout,
    panels,
  });
}

export function normalizeProjectPanelState(
  state: ProjectParallelPanelTreeState,
): ProjectParallelPanelTreeState | null {
  const leafIds = collectProjectPanelIds(state.layout);
  const panels = leafIds.reduce<Record<string, ProjectParallelPanel>>((nextPanels, panelId) => {
    const panel = state.panels[panelId];
    if (panel) nextPanels[panelId] = panel;
    return nextPanels;
  }, {});
  const firstPanelId = leafIds.find((panelId) => panels[panelId]) ?? null;
  if (!firstPanelId) return null;

  return {
    layout: state.layout,
    panels,
    activePanelId: panels[state.activePanelId] ? state.activePanelId : firstPanelId,
  };
}

export function pruneProjectPanelStateByChatIds(
  state: ProjectParallelPanelTreeState,
  validChatIds: Set<string>,
): ProjectParallelPanelTreeState | null {
  const invalidPanelIds = Object.values(state.panels)
    .filter((panel) => !validChatIds.has(panel.chatId))
    .map((panel) => panel.id);
  if (invalidPanelIds.length === 0) return state;

  let layout: ProjectParallelPanelNode | null = state.layout;
  const panels = { ...state.panels };
  for (const panelId of invalidPanelIds) {
    layout = layout ? removeProjectPanelLeaf(layout, panelId) : null;
    delete panels[panelId];
  }
  if (!layout) return null;

  return normalizeProjectPanelState({
    activePanelId: panels[state.activePanelId] ? state.activePanelId : findFirstProjectPanelId(layout),
    layout,
    panels,
  });
}

function replaceTargetPanelChat(
  state: ProjectParallelPanelTreeState,
  targetPanelId: string,
  chatId: string,
  sourcePanelId: string | null,
): ProjectParallelPanelTreeState | null {
  const panels = { ...state.panels };
  const targetPanel = panels[targetPanelId];
  if (!targetPanel) return null;

  let layout = state.layout;
  if (sourcePanelId && sourcePanelId !== targetPanelId) {
    layout = removeProjectPanelLeaf(layout, sourcePanelId) ?? layout;
    delete panels[sourcePanelId];
  }

  panels[targetPanelId] = { ...targetPanel, chatId };
  return normalizeProjectPanelState({
    activePanelId: targetPanelId,
    layout,
    panels,
  });
}

function replaceProjectPanelLeaf(
  node: ProjectParallelPanelNode,
  targetPanelId: string,
  replacement: ProjectParallelPanelNode,
): ProjectParallelPanelNode | null {
  if (node.type === 'leaf') {
    return node.panelId === targetPanelId ? replacement : node;
  }
  const left = replaceProjectPanelLeaf(node.children[0], targetPanelId, replacement);
  const right = replaceProjectPanelLeaf(node.children[1], targetPanelId, replacement);
  if (!left || !right) return null;
  if (left === node.children[0] && right === node.children[1]) return node;
  return { ...node, children: [left, right] };
}

function removeProjectPanelLeaf(
  node: ProjectParallelPanelNode,
  panelId: string,
): ProjectParallelPanelNode | null {
  if (node.type === 'leaf') return node.panelId === panelId ? null : node;
  const left = removeProjectPanelLeaf(node.children[0], panelId);
  const right = removeProjectPanelLeaf(node.children[1], panelId);
  if (!left) return right;
  if (!right) return left;
  if (left === node.children[0] && right === node.children[1]) return node;
  return { ...node, children: [left, right] };
}

function buildProjectSplitNode(
  targetLeaf: ProjectParallelPanelLeafNode,
  insertedLeaf: ProjectParallelPanelLeafNode,
  edge: Exclude<ProjectParallelPanelDropEdge, 'center'>,
): ProjectParallelPanelSplitNode {
  return {
    type: edge === 'left' || edge === 'right' ? 'hsplit' : 'vsplit',
    ratio: 0.5,
    children: edge === 'left' || edge === 'top'
      ? [insertedLeaf, targetLeaf]
      : [targetLeaf, insertedLeaf],
  };
}

function updateProjectSplitRatio(
  node: ProjectParallelPanelNode,
  leftAnchorId: string,
  rightAnchorId: string,
  ratio: number,
): ProjectParallelPanelNode {
  if (node.type === 'leaf') return node;
  if (
    findFirstProjectPanelId(node.children[0]) === leftAnchorId
    && findFirstProjectPanelId(node.children[1]) === rightAnchorId
  ) {
    return { ...node, ratio };
  }
  const left = updateProjectSplitRatio(node.children[0], leftAnchorId, rightAnchorId, ratio);
  const right = updateProjectSplitRatio(node.children[1], leftAnchorId, rightAnchorId, ratio);
  if (left === node.children[0] && right === node.children[1]) return node;
  return { ...node, children: [left, right] };
}

function clampProjectPanelRatio(ratio: number): number {
  if (!Number.isFinite(ratio)) return 0.5;
  return Math.max(PROJECT_PANEL_MIN_RATIO, Math.min(PROJECT_PANEL_MAX_RATIO, ratio));
}
