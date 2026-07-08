import type { DragEvent } from 'react';
import type { ProviderLogoProvider } from '@/components/ui/ProviderLogo';
import { isTerminalRunStatus, readUiEventRunStatus } from '@/lib/happy/chatRuntime';
import { withAppBasePath } from '@/lib/routing/appPath';
import type { SessionChat, SessionEventsPage, SessionStatus, SessionSummary, UiEvent } from '@/lib/happy/types';
import { buildProjectChatCollectionPath, buildProjectWorkspacePath } from '@/lib/projectRuntimeAdapter';
import {
  computeProjectPanelDropEdge,
  parseProjectPanelState,
  type ProjectParallelPanelDropEdge,
  type ProjectParallelPanelTreeState,
} from '@/app/projectParallelPanels';
import { eventCommand, isProjectRunStatusEvent } from './helpers/projectChatEvents';

// ---------------------------------------------------------------------------
// Project chat surface types
// ---------------------------------------------------------------------------
export type ComposerMode = 'agent' | 'plan' | 'terminal';
export type WorkspaceTab = 'run' | 'files' | 'git' | 'terminal' | 'context' | 'subagents';
export type PreviewState = 'closed' | 'open' | 'dock';
export type ModelProvider = ProviderLogoProvider;
export type ReasoningEffort = 'Low' | 'Medium' | 'High' | 'XHigh' | 'Max';
export type ExpandedTurnState = string | null | '__none__';
export type ProjectRunIndicator = {
  label: string;
  startedAt: string;
  tone: 'submitting' | 'running' | 'approval' | 'aborting';
};
export type ProjectChatEventsResponse = {
  events?: UiEvent[];
  page?: Partial<SessionEventsPage>;
  error?: string;
};
export type ProjectChatSurfaceMode = 'full' | 'panel';
export type ProjectChatDragPayload = {
  projectId: string;
  chatId: string;
  title: string;
};
export type ProjectPanelNodeDragPayload = ProjectChatDragPayload & {
  panelId: string;
};
export type ProjectWorkspacePanelRuntime = {
  panelId: string;
  chatId: string;
  runtimeSessionId: string | null;
  branch: string | null;
  worktreePath: string | null;
};
export type ProjectWorkspacePanelRuntimeMap = Record<string, ProjectWorkspacePanelRuntime>;
export type ProjectPanelRuntimeErrors = Record<string, string>;
export type ProjectPanelRuntimeBadge = {
  label: string;
  detail: string;
  tone: 'ready' | 'running' | 'pending' | 'error';
};
export type ProjectPanelGitFile = {
  path: string;
  indexStatus: string;
  workTreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
};
export type ProjectPanelGitOverview = {
  workspacePath: string;
  branch: string | null;
  upstreamBranch: string | null;
  ahead: number;
  behind: number;
  isClean: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  files: ProjectPanelGitFile[];
};
export type ProjectChatDragStartHandler = (
  event: DragEvent<HTMLElement>,
  projectId: string,
  chat: Pick<SessionChat, 'id' | 'title'>,
) => void;
export type ProjectPanelNodeDragStartHandler = (
  event: DragEvent<HTMLElement>,
  panelId: string,
  chat: Pick<SessionChat, 'id' | 'title'>,
) => void;
export type ProjectPanelDropHandler = (
  targetPanelId: string,
  edge: ProjectParallelPanelDropEdge,
  event: DragEvent<HTMLElement>,
) => void;

// ---------------------------------------------------------------------------
// Project chat surface constants
// ---------------------------------------------------------------------------
export const WORKSPACE_DRAWER_CLOSE_MS = 160;
export const PROJECT_CHAT_EVENT_PAGE_LIMIT = 40;
export const PROJECT_CHAT_BOTTOM_THRESHOLD_PX = 96;

export function isProjectChatTimelineNearBottom(node: HTMLElement | null): boolean {
  if (!node) return false;
  const distanceFromBottom = node.scrollHeight - node.scrollTop - node.clientHeight;
  return distanceFromBottom <= PROJECT_CHAT_BOTTOM_THRESHOLD_PX;
}

export const PROVIDER_LABELS: Record<ModelProvider, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
};

export const PROVIDER_EFFORTS: Record<ModelProvider, ReasoningEffort[]> = {
  claude: ['Low', 'Medium', 'High', 'XHigh', 'Max'],
  codex: ['Low', 'Medium', 'High', 'XHigh'],
  gemini: ['Low', 'Medium', 'High'],
};

export const COMPOSER_MODE_COPY: Record<ComposerMode, string> = {
  agent: 'Agent',
  plan: 'Plan',
  terminal: 'Terminal',
};

export const PROJECT_ACTIVE_RUN_STATUSES = new Set(['run_started', 'turn_started', 'model_normalized']);
export const PROJECT_CHAT_DRAG_MIME = 'application/x-aris-project-chat';
export const PROJECT_CHAT_DRAG_JSON_MIME = 'application/json';
export const PROJECT_PANEL_NODE_DRAG_MIME = 'application/x-aris-project-panel-node';

// ---------------------------------------------------------------------------
// Project chat surface helpers
// ---------------------------------------------------------------------------
export function providerFromAgent(agent: SessionSummary['agent'] | SessionChat['agent']): ModelProvider {
  if (agent === 'claude' || agent === 'gemini' || agent === 'codex') return agent;
  return 'codex';
}

export function normalizeReasoningEffort(value: SessionChat['modelReasoningEffort'] | null | undefined): ReasoningEffort {
  if (value === 'low') return 'Low';
  if (value === 'medium') return 'Medium';
  if (value === 'xhigh') return 'XHigh';
  return 'High';
}

export function serializeReasoningEffort(value: ReasoningEffort): SessionChat['modelReasoningEffort'] {
  if (value === 'Low') return 'low';
  if (value === 'Medium') return 'medium';
  if (value === 'XHigh' || value === 'Max') return 'xhigh';
  return 'high';
}

export async function copyToClipboard(value: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(textarea);
    return copied;
  } catch {
    return false;
  }
}

export function displayProjectName(session: SessionSummary): string {
  const candidate = session.alias || session.projectName || session.id;
  const normalized = candidate.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || candidate;
}

export function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return 'unknown';

  const diffMs = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

export function projectStatusLabel(status: SessionStatus): string {
  if (status === 'running') return 'running';
  if (status === 'error') return 'approval';
  return 'idle';
}

export function projectStatusBadgeClass(status: SessionStatus): string {
  if (status === 'running') return 'badge--info';
  if (status === 'error') return 'badge--warning';
  return 'badge--neutral';
}

export function writeProjectChatDragPayload(
  event: DragEvent<HTMLElement>,
  projectId: string,
  chat: Pick<SessionChat, 'id' | 'title'>,
) {
  const payload = JSON.stringify({
    projectId,
    chatId: chat.id,
    title: chat.title,
  } satisfies ProjectChatDragPayload);

  event.dataTransfer.effectAllowed = 'copyMove';
  event.dataTransfer.setData(PROJECT_CHAT_DRAG_MIME, payload);
  event.dataTransfer.setData(PROJECT_CHAT_DRAG_JSON_MIME, payload);
  event.dataTransfer.setData('text/plain', payload);
}

export function writeProjectPanelNodeDragPayload(
  event: DragEvent<HTMLElement>,
  projectId: string,
  panelId: string,
  chat: Pick<SessionChat, 'id' | 'title'>,
) {
  const payload = JSON.stringify({
    projectId,
    panelId,
    chatId: chat.id,
    title: chat.title,
  } satisfies ProjectPanelNodeDragPayload);

  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData(PROJECT_PANEL_NODE_DRAG_MIME, payload);
  event.dataTransfer.setData(PROJECT_CHAT_DRAG_MIME, payload);
  event.dataTransfer.setData(PROJECT_CHAT_DRAG_JSON_MIME, payload);
  event.dataTransfer.setData('text/plain', payload);
}

export function readProjectChatDragPayload(event: DragEvent<HTMLElement>): ProjectChatDragPayload | null {
  const types = Array.from(event.dataTransfer.types);
  if (!types.includes(PROJECT_CHAT_DRAG_MIME) && !types.includes(PROJECT_CHAT_DRAG_JSON_MIME) && !types.includes('text/plain')) {
    return null;
  }

  try {
    const rawPayload = event.dataTransfer.getData(PROJECT_CHAT_DRAG_MIME)
      || event.dataTransfer.getData(PROJECT_CHAT_DRAG_JSON_MIME)
      || event.dataTransfer.getData('text/plain');
    const parsed = JSON.parse(rawPayload) as Partial<ProjectChatDragPayload> & { sessionId?: unknown };
    const parsedProjectId = typeof parsed.projectId === 'string' ? parsed.projectId : parsed.sessionId;
    if (
      typeof parsedProjectId !== 'string'
      || typeof parsed.chatId !== 'string'
      || typeof parsed.title !== 'string'
      || !parsedProjectId.trim()
      || !parsed.chatId.trim()
    ) {
      return null;
    }

    return {
      projectId: parsedProjectId,
      chatId: parsed.chatId,
      title: parsed.title,
    };
  } catch {
    return null;
  }
}

export function readProjectPanelNodeDragPayload(event: DragEvent<HTMLElement>): ProjectPanelNodeDragPayload | null {
  if (!Array.from(event.dataTransfer.types).includes(PROJECT_PANEL_NODE_DRAG_MIME)) {
    return null;
  }

  try {
    const rawPayload = event.dataTransfer.getData(PROJECT_PANEL_NODE_DRAG_MIME);
    const parsed = JSON.parse(rawPayload) as Partial<ProjectPanelNodeDragPayload> & { sessionId?: unknown };
    const parsedProjectId = typeof parsed.projectId === 'string' ? parsed.projectId : parsed.sessionId;
    if (
      typeof parsedProjectId !== 'string'
      || typeof parsed.panelId !== 'string'
      || typeof parsed.chatId !== 'string'
      || typeof parsed.title !== 'string'
      || !parsedProjectId.trim()
      || !parsed.panelId.trim()
      || !parsed.chatId.trim()
    ) {
      return null;
    }

    return {
      projectId: parsedProjectId,
      panelId: parsed.panelId,
      chatId: parsed.chatId,
      title: parsed.title,
    };
  } catch {
    return null;
  }
}

export function hasProjectChatDragPayload(event: DragEvent<HTMLElement>): boolean {
  const types = Array.from(event.dataTransfer.types);
  return types.includes(PROJECT_CHAT_DRAG_MIME)
    || types.includes(PROJECT_CHAT_DRAG_JSON_MIME)
    || types.includes(PROJECT_PANEL_NODE_DRAG_MIME);
}

export function resolveProjectParallelDropEdge(event: DragEvent<HTMLElement>): ProjectParallelPanelDropEdge {
  const rect = event.currentTarget.getBoundingClientRect();
  return computeProjectPanelDropEdge(event.clientX, event.clientY, rect);
}

export function createProjectPanelId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return `pcp-${crypto.randomUUID()}`;
  }
  return `pcp-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export async function createProjectChat(
  projectId: string,
  input: {
    title?: string;
    agent?: SessionSummary['agent'];
    model?: string | null;
    geminiMode?: string | null;
    modelReasoningEffort?: SessionChat['modelReasoningEffort'];
  },
): Promise<SessionChat> {
  const response = await fetch(withAppBasePath(buildProjectChatCollectionPath(projectId)), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = (await response.json().catch(() => ({}))) as { chat?: SessionChat; error?: string };
  if (!response.ok || !body.chat) {
    throw new Error(body.error ?? '새 채팅을 만들지 못했습니다.');
  }
  return body.chat;
}

export async function fetchProjectWorkspaceLayout(
  projectId: string,
  validChatIds: Set<string>,
): Promise<{
  layout: ProjectParallelPanelTreeState | null;
  panelRuntime: ProjectWorkspacePanelRuntimeMap;
  panelRuntimeErrors: ProjectPanelRuntimeErrors;
}> {
  const response = await fetch(withAppBasePath(buildProjectWorkspacePath(projectId)), { cache: 'no-store' });
  if (!response.ok) return { layout: null, panelRuntime: {}, panelRuntimeErrors: {} };
  const body = (await response.json().catch(() => ({}))) as {
    workspace?: {
      layout?: ProjectParallelPanelTreeState | null;
      panels?: ProjectWorkspacePanelRuntime[];
    };
  };
  const layout = body.workspace?.layout ?? null;
  const panels = Array.isArray(body.workspace?.panels) ? body.workspace.panels : [];
  const panelRuntime = panels.reduce<ProjectWorkspacePanelRuntimeMap>((acc, panel) => {
    if (panel && typeof panel.panelId === 'string' && validChatIds.has(panel.chatId)) {
      acc[panel.panelId] = panel;
    }
    return acc;
  }, {});
  return {
    layout: parseProjectPanelApiState(layout, validChatIds),
    panelRuntime,
    panelRuntimeErrors: {},
  };
}

export function parseProjectPanelApiState(
  layout: ProjectParallelPanelTreeState | ({ version?: number } & Partial<ProjectParallelPanelTreeState>) | null,
  validChatIds: Set<string>,
): ProjectParallelPanelTreeState | null {
  if (!layout || typeof layout !== 'object') return null;
  const payload = 'version' in layout
    ? layout
    : { version: 1, ...layout };
  return parseProjectPanelState(JSON.stringify(payload), validChatIds);
}

export async function saveProjectWorkspaceLayout(
  projectId: string,
  layout: ProjectParallelPanelTreeState | null,
  options: { repairPanelRuntimes?: boolean } = {},
): Promise<{ panelRuntime: ProjectWorkspacePanelRuntimeMap; panelRuntimeErrors: ProjectPanelRuntimeErrors }> {
  const response = await fetch(withAppBasePath(buildProjectWorkspacePath(projectId)), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ layout, ...(options.repairPanelRuntimes ? { repairPanelRuntimes: true } : {}) }),
  });
  const body = (await response.json().catch(() => ({}))) as {
    workspace?: {
      panels?: ProjectWorkspacePanelRuntime[];
    };
    panelRuntimeErrors?: ProjectPanelRuntimeErrors;
    error?: string;
  };
  if (!response.ok) {
    throw new Error(body.error ?? 'Workspace layout 저장에 실패했습니다.');
  }
  const panels = Array.isArray(body.workspace?.panels) ? body.workspace.panels : [];
  return {
    panelRuntime: panels.reduce<ProjectWorkspacePanelRuntimeMap>((acc, panel) => {
      if (panel && typeof panel.panelId === 'string') {
        acc[panel.panelId] = panel;
      }
      return acc;
    }, {}),
    panelRuntimeErrors: body.panelRuntimeErrors && typeof body.panelRuntimeErrors === 'object'
      ? body.panelRuntimeErrors
      : {},
  };
}

export async function fetchProjectPanelGitOverview(projectId: string, panelId: string): Promise<ProjectPanelGitOverview> {
  const params = new URLSearchParams();
  params.set('kind', 'overview');
  params.set('workspacePanelId', panelId);
  const response = await fetch(
    withAppBasePath(`/api/runtime/sessions/${encodeURIComponent(projectId)}/git?${params.toString()}`),
    { cache: 'no-store' },
  );
  const body = (await response.json().catch(() => ({}))) as ProjectPanelGitOverview & { error?: string };
  if (!response.ok) {
    throw new Error(body.error ?? 'Git 정보를 불러오지 못했습니다.');
  }
  return body;
}

export function resolvePanelRuntimeBadge(
  panelRuntime: ProjectWorkspacePanelRuntime | null,
  runtimeRunning: boolean,
  panelRuntimeError: string | null,
): ProjectPanelRuntimeBadge {
  if (panelRuntimeError) {
    return {
      label: 'runtime 생성 실패',
      detail: panelRuntimeError,
      tone: 'error',
    };
  }
  if (runtimeRunning) {
    return {
      label: 'running',
      detail: panelRuntime?.branch ?? panelRuntime?.runtimeSessionId ?? 'panel runtime',
      tone: 'running',
    };
  }
  if (!panelRuntime?.runtimeSessionId) {
    return {
      label: 'runtime pending',
      detail: '패널 runtime/worktree 생성 대기',
      tone: 'pending',
    };
  }
  if (!panelRuntime.worktreePath) {
    return {
      label: 'worktree missing',
      detail: panelRuntime.branch ?? panelRuntime.runtimeSessionId,
      tone: 'error',
    };
  }
  return {
    label: 'ready',
    detail: panelRuntime.branch ?? panelRuntime.worktreePath,
    tone: 'ready',
  };
}

export function readEventRole(event: UiEvent): 'user' | 'agent' | 'terminal' {
  if (event.meta?.role === 'user') return 'user';
  if (event.meta?.role === 'terminal') return 'terminal';
  return 'agent';
}

export function getEventText(event: UiEvent): string {
  return event.result?.preview || event.body || event.title;
}

export function terminalCommand(event: UiEvent): string {
  const metaCommand = typeof event.meta?.command === 'string' ? event.meta.command.trim() : '';
  return event.action?.command || metaCommand || eventCommand(event);
}

export function terminalOutput(event: UiEvent): string {
  const bodyOutput = event.body.replace(/\r\n/g, '\n').split('\n').slice(1).join('\n').trim();
  return event.result?.preview || bodyOutput || getEventText(event) || '(no output)';
}

export function mergeProjectChatEvents(events: UiEvent[]): UiEvent[] {
  const dedup = new Map<string, UiEvent>();
  for (const event of events) {
    dedup.set(event.id, event);
  }
  return [...dedup.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function agentLabel(agent: SessionSummary['agent'], model?: string | null): string {
  const provider = agent === 'claude' ? 'Claude' : agent === 'gemini' ? 'Gemini' : agent === 'codex' ? 'Codex' : 'Agent';
  return model ? `${provider} · ${model}` : provider;
}

export function agentAvatarClass(agent: SessionSummary['agent'] | SessionChat['agent']): string {
  if (agent === 'claude') return 'msg__avatar--claude';
  if (agent === 'gemini') return 'msg__avatar--gemini';
  if (agent === 'codex') return 'msg__avatar--codex';
  return 'msg__avatar--sys';
}

export function readLatestProjectRunLifecycle(events: UiEvent[]): { status: string; timestamp: string } | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!isProjectRunStatusEvent(event)) continue;
    return { status: readUiEventRunStatus(event), timestamp: event.timestamp };
  }
  return null;
}

export function isProjectTimestampAfter(value: string | null, reference: string | null): boolean {
  if (!value) return false;
  if (!reference) return true;
  const valueTime = Date.parse(value);
  const referenceTime = Date.parse(reference);
  if (!Number.isFinite(valueTime) || !Number.isFinite(referenceTime)) {
    return value > reference;
  }
  return valueTime > referenceTime;
}

export function resolveProjectRunStartedAt(events: UiEvent[], fallbackStartedAt: string | null): string | null {
  let startedAt = fallbackStartedAt;
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!isProjectRunStatusEvent(event)) continue;
    const status = readUiEventRunStatus(event);
    if (isTerminalRunStatus(status)) break;
    if (PROJECT_ACTIVE_RUN_STATUSES.has(status)) {
      startedAt = event.timestamp;
    }
    if (status === 'run_started' || status === 'turn_started') {
      break;
    }
  }
  return startedAt;
}

export function resolveProjectRunIndicator({
  events,
  hasPendingPermission = false,
  isAborting,
  isSubmitting,
  pendingPermissionStartedAt = null,
  runtimeRunning,
  startedAt,
}: {
  events: UiEvent[];
  hasPendingPermission?: boolean;
  isAborting: boolean;
  isSubmitting: boolean;
  pendingPermissionStartedAt?: string | null;
  runtimeRunning: boolean;
  startedAt: string | null;
}): ProjectRunIndicator | null {
  const latestLifecycle = readLatestProjectRunLifecycle(events);
  const latestStatus = latestLifecycle?.status ?? '';
  const localStartAfterLatestLifecycle = isProjectTimestampAfter(startedAt, latestLifecycle?.timestamp ?? null);
  if (latestStatus && isTerminalRunStatus(latestStatus) && !localStartAfterLatestLifecycle) {
    return null;
  }

  const resolvedStartedAt = localStartAfterLatestLifecycle ? startedAt : resolveProjectRunStartedAt(events, startedAt);
  if (isAborting && resolvedStartedAt) {
    return { label: '중단 중', startedAt: resolvedStartedAt, tone: 'aborting' };
  }
  if (isSubmitting && resolvedStartedAt) {
    return { label: '요청 전송 중', startedAt: resolvedStartedAt, tone: 'submitting' };
  }
  if (hasPendingPermission) {
    return { label: '승인 대기', startedAt: pendingPermissionStartedAt ?? resolvedStartedAt ?? new Date().toISOString(), tone: 'approval' };
  }
  if (latestStatus === 'waiting_for_approval' && resolvedStartedAt) {
    return { label: '승인 대기', startedAt: resolvedStartedAt, tone: 'approval' };
  }
  if ((PROJECT_ACTIVE_RUN_STATUSES.has(latestStatus) || runtimeRunning || startedAt) && resolvedStartedAt) {
    return { label: '실행 중', startedAt: resolvedStartedAt, tone: 'running' };
  }
  return null;
}
