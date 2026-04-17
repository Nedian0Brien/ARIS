import type { ComponentType, ReactNode } from 'react';
import {
  Brain,
  CircleAlert,
  Cpu,
  File,
  FileCode,
  FilePenLine,
  FileSearch,
  FileText,
  Folder,
  FolderTree,
  MessageSquareText,
  TerminalSquare,
} from 'lucide-react';
import { readLocalStorage, writeLocalStorage } from '@/lib/browser/localStorage';
import {
  isRunLifecycleEvent,
  isTerminalRunStatus,
  readUiEventRunStatus,
  readUiEventStreamEvent,
} from '@/lib/happy/chatRuntime';
import type {
  AgentFlavor,
  ApprovalPolicy,
  ChatImageAttachment,
  SessionChat,
  UiEvent,
  UiEventKind,
  UiEventResult,
} from '@/lib/happy/types';
import {
  DEFAULT_GEMINI_MODE_ID,
  GEMINI_MODE_SELECTION_OPTIONS,
  deriveOpenAiModelLabel,
  type ProviderModelSelections,
} from '@/lib/settings/providerModels';
import {
  ClaudeIcon,
  CodexIcon,
  DockerLogoIcon,
  GeminiIcon,
  GitLogoIcon,
} from '@/components/ui/AgentIcons';
import {
  ACTION_COLLAPSE_THRESHOLD,
  CHAT_SIDEBAR_SECTION_LABELS,
  COMPOSER_MODELS_BY_AGENT,
  DEFAULT_CHAT_RUNTIME_UI_STATE,
  PREVIEW_MAX_CHARS,
  PREVIEW_MAX_LINES,
  RECENT_FILES_MAX,
  RECENT_FILES_STORAGE_KEY,
  WORKSPACE_FILE_OPEN_EVENT,
} from './constants';
import type {
  ActionKind,
  AgentMeta,
  ChatSidebarSnapshot,
  ComposerModelOption,
  ContextItem,
  FolderLabel,
  GeminiModeOption,
  LegacyCustomModels,
  ModelReasoningEffort,
  ResourceLabel,
  StreamRenderItem,
  Tone,
  WorkspaceFileOpenDetail,
} from './types';
import { FOLDER_LABELS } from './types';
import {
  normalizeLocalPathTarget,
  parseLocalFileReferenceTarget,
  scanMarkdownLinks,
} from '../chatFileReferences';

export function getRecentFiles(): string[] {
  try {
    return JSON.parse(readLocalStorage(RECENT_FILES_STORAGE_KEY) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function saveRecentFile(filePath: string): void {
  try {
    const prev = getRecentFiles().filter((path) => path !== filePath);
    writeLocalStorage(RECENT_FILES_STORAGE_KEY, JSON.stringify([filePath, ...prev].slice(0, RECENT_FILES_MAX)));
  } catch {
    // localStorage unavailable
  }
}

export async function copyTextToClipboard(text: string): Promise<void> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === 'undefined') {
    throw new Error('clipboard-unavailable');
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', 'true');
  textarea.style.position = 'fixed';
  textarea.style.top = '0';
  textarea.style.left = '0';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();

  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error('clipboard-unavailable');
  }
}

export function getFileIcon(name: string, isDirectory: boolean): ReactNode {
  if (isDirectory) return <Folder size={14} />;
  const ext = name.split('.').pop()?.toLowerCase() ?? '';
  if (['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'java', 'c', 'cpp', 'cs'].includes(ext)) {
    return <FileCode size={14} />;
  }
  if (['md', 'txt', 'yaml', 'yml', 'toml', 'json'].includes(ext)) {
    return <FileText size={14} />;
  }
  return <File size={14} />;
}

export function extractImageAttachments(items: ContextItem[]): ChatImageAttachment[] {
  return items.flatMap((item) => (item.type === 'image' ? [item.attachment] : []));
}

export function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

export function isFolderLabel(label: string): label is FolderLabel {
  return (FOLDER_LABELS as readonly string[]).includes(label);
}

export function fileExtension(filename: string): string {
  const base = filename.trim().split('/').pop() ?? '';
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === base.length - 1) {
    return '';
  }
  const ext = base.slice(dotIndex + 1).toLowerCase();
  if (!/^[a-z0-9]+$/.test(ext)) return '';
  return ext;
}

export function normalizeWorkspaceClientPath(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    return '/';
  }

  const withLeadingSlash = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  const normalized = withLeadingSlash.replace(/\/+/g, '/').replace(/\/$/, '');
  return normalized || '/';
}

export function joinWorkspacePath(dirPath: string, name: string): string {
  const normalizedDir = normalizeWorkspaceClientPath(dirPath);
  const trimmedName = name.trim().replace(/^\/+/, '');
  return normalizedDir === '/' ? `/${trimmedName}` : `${normalizedDir}/${trimmedName}`;
}

export function buildChatUrl(sessionId: string, chatId: string): string {
  return `/sessions/${encodeURIComponent(sessionId)}?chat=${encodeURIComponent(chatId)}`;
}

export function readChatIdFromLocation(): string | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const raw = new URL(window.location.href).searchParams.get('chat');
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed || null;
}

export function writeChatIdToHistory(url: string, mode: 'push' | 'replace' = 'push') {
  if (typeof window === 'undefined') {
    return;
  }
  const current = `${window.location.pathname}${window.location.search}`;
  if (current === url) {
    return;
  }
  if (mode === 'replace') {
    window.history.replaceState({}, '', url);
    return;
  }
  window.history.pushState({}, '', url);
}

export function isWorkspacePathWithinRoot(targetPath: string, rootPath: string): boolean {
  const normalizedTarget = normalizeWorkspaceClientPath(targetPath);
  const normalizedRoot = normalizeWorkspaceClientPath(rootPath);
  return normalizedRoot === '/'
    ? normalizedTarget.startsWith('/')
    : normalizedTarget === normalizedRoot || normalizedTarget.startsWith(`${normalizedRoot}/`);
}

export function dispatchWorkspaceFileOpen(detail: WorkspaceFileOpenDetail) {
  if (typeof window === 'undefined') {
    return;
  }

  window.dispatchEvent(new CustomEvent<WorkspaceFileOpenDetail>(WORKSPACE_FILE_OPEN_EVENT, {
    detail: {
      ...detail,
      path: normalizeWorkspaceClientPath(detail.path),
      line: typeof detail.line === 'number' ? detail.line : null,
    },
  }));
}

export function classifyLabelLink(label: string, rawPath: string): ResourceLabel | null {
  const normalizedLabel = label.trim();
  if (!normalizedLabel) {
    return null;
  }

  const normalizedPath = normalizeLocalPathTarget(rawPath);
  if (!normalizedPath) {
    return null;
  }

  const folderCandidate = normalizedLabel.toLowerCase();
  if (isFolderLabel(folderCandidate)) {
    return {
      kind: 'folder',
      name: folderCandidate as FolderLabel,
      sourcePath: normalizedPath.path,
      sourceLine: normalizedPath.line,
    };
  }

  const parsedFile = parseLocalFileReferenceTarget(rawPath);
  if (parsedFile) {
    const displayName = fileExtension(normalizedLabel) ? normalizedLabel : parsedFile.name;
    return {
      kind: 'file',
      name: displayName,
      extension: parsedFile.extension,
      sourcePath: parsedFile.path,
      sourceLine: parsedFile.line,
    };
  }

  return null;
}

export function classifyPath(pathValue: string): ResourceLabel | null {
  const normalizedPath = pathValue.trim();
  if (!normalizedPath) {
    return null;
  }

  const basename = normalizedPath.split('/').filter(Boolean).pop() ?? normalizedPath;
  const extension = fileExtension(basename);
  if (extension) {
    return { kind: 'file', name: basename, extension, sourcePath: normalizedPath };
  }

  const folderCandidate = basename.toLowerCase();
  if (isFolderLabel(folderCandidate)) {
    return { kind: 'folder', name: folderCandidate as FolderLabel, sourcePath: normalizedPath };
  }

  return null;
}

export function resolveAgentMeta(agentFlavor: string): AgentMeta {
  if (agentFlavor === 'claude') {
    return { label: 'Claude', tone: 'clay', Icon: ClaudeIcon };
  }
  if (agentFlavor === 'codex') {
    return { label: 'Codex', tone: 'mint', Icon: CodexIcon };
  }
  if (agentFlavor === 'gemini') {
    return { label: 'Gemini', tone: 'blue', Icon: GeminiIcon };
  }
  return { label: 'Runtime', tone: 'blue', Icon: Cpu };
}

export function resolveAgentSubtitle(agentFlavor: string): string {
  if (agentFlavor === 'claude') return '균형 잡힌 코딩 흐름';
  if (agentFlavor === 'codex') return '빠른 구현 및 실행';
  if (agentFlavor === 'gemini') return '넓은 맥락과 추론';
  return '에이전틱 런타임';
}

export function normalizeAgentFlavor(value: unknown, fallback: AgentFlavor = 'codex'): AgentFlavor {
  if (value === 'claude' || value === 'codex' || value === 'gemini') {
    return value;
  }
  return fallback;
}

export function normalizeModelId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const canonical = trimmed === 'gpt-5-codex' ? 'gpt-5.3-codex' : trimmed;
  return canonical.slice(0, 120);
}

export function normalizeGeminiModeId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 120);
}

export function normalizeModelReasoningEffort(
  value: unknown,
  fallback: ModelReasoningEffort = 'medium',
): ModelReasoningEffort {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
    return value;
  }
  return fallback;
}

export function isSupportedAgentFlavor(value: AgentFlavor): value is 'codex' | 'claude' | 'gemini' {
  return value === 'codex' || value === 'claude' || value === 'gemini';
}

export function deriveGeminiModeLabel(modeId: string): string {
  const normalized = modeId.trim().toLowerCase();
  if (normalized === 'default') {
    return 'Default';
  }
  if (normalized === 'yolo') {
    return 'YOLO';
  }
  if (normalized === 'plan') {
    return 'Plan';
  }
  if (normalized === 'autoedit' || normalized === 'auto_edit') {
    return 'Auto Edit';
  }
  return modeId
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveGeminiModeOptions(approvalPolicy?: ApprovalPolicy): GeminiModeOption[] {
  const options = GEMINI_MODE_SELECTION_OPTIONS as ReadonlyArray<{ id: string; label: string }>;
  return options
    .filter((option) => approvalPolicy === 'yolo' || option.id !== 'yolo')
    .map((option, index) => ({
      id: option.id,
      shortLabel: option.label || deriveGeminiModeLabel(option.id),
      badge: option.id === 'yolo'
        ? '무승인'
        : index === 0
          ? '기본'
          : '설정 가능',
    }));
}

export function resolveComposerModels(
  agent: AgentFlavor,
  providerSelections?: ProviderModelSelections,
  legacyCustomModels?: LegacyCustomModels,
): ComposerModelOption[] {
  const baseModels = isSupportedAgentFlavor(agent)
    ? COMPOSER_MODELS_BY_AGENT[agent]
    : COMPOSER_MODELS_BY_AGENT.codex;

  const selectedModelIds = isSupportedAgentFlavor(agent)
    ? (providerSelections?.[agent]?.selectedModelIds ?? [])
    : [];
  if (selectedModelIds.length > 0) {
    return selectedModelIds.map((modelId: string, index: number) => {
      const baseMatch = baseModels.find((item) => item.id === modelId);
      if (baseMatch) {
        return {
          ...baseMatch,
          badge: index === 0 ? '등록됨' : baseMatch.badge,
        };
      }
      return {
        id: modelId,
        shortLabel: agent === 'codex' ? deriveOpenAiModelLabel(modelId) : modelId,
        badge: index === 0 ? '등록됨' : '선택됨',
      };
    });
  }

  if (legacyCustomModels) {
    const customId = legacyCustomModels[agent];
    if (customId && customId.trim() !== '') {
      const trimmed = customId.trim();
      return [
        { id: trimmed, shortLabel: trimmed, badge: '커스텀' },
        ...baseModels.filter((model) => model.id !== trimmed),
      ];
    }
  }
  return baseModels;
}

export function resolveDefaultModelId(
  agent: AgentFlavor,
  providerSelections?: ProviderModelSelections,
  legacyCustomModels?: LegacyCustomModels,
  cachedModelId?: string | null,
): string {
  const availableModels = resolveComposerModels(agent, providerSelections, legacyCustomModels);
  if (isSupportedAgentFlavor(agent)) {
    const preferred = resolvePreferredModelId({
      availableModelIds: availableModels.map((model) => model.id),
      cachedModelId: agent === 'codex' ? cachedModelId : null,
      configuredDefaultModelId: normalizeModelId(providerSelections?.[agent]?.defaultModelId),
      fallbackModelId: 'gpt-5.4',
    });
    return preferred ?? 'gpt-5.4';
  }
  return availableModels[0]?.id ?? 'gpt-5.4';
}

function resolvePreferredModelId(input: {
  availableModelIds: string[];
  cachedModelId?: string | null;
  configuredDefaultModelId?: string | null;
  fallbackModelId: string;
}): string | null {
  const availableModelIds = new Set(input.availableModelIds);
  if (input.cachedModelId && availableModelIds.has(input.cachedModelId)) {
    return input.cachedModelId;
  }
  if (input.configuredDefaultModelId && availableModelIds.has(input.configuredDefaultModelId)) {
    return input.configuredDefaultModelId;
  }
  if (availableModelIds.has(input.fallbackModelId)) {
    return input.fallbackModelId;
  }
  return input.availableModelIds[0] ?? null;
}

export function resolveAvailableComposerModelId(input: {
  agent: AgentFlavor;
  requestedModel?: unknown;
  sessionModelFallback?: unknown;
  providerSelections?: ProviderModelSelections;
  legacyCustomModels?: LegacyCustomModels;
}): string {
  const availableModels = resolveComposerModels(
    input.agent,
    input.providerSelections,
    input.legacyCustomModels,
  );
  const availableIds = new Set(availableModels.map((model) => model.id));
  const requestedModel = normalizeModelId(input.requestedModel);
  if (requestedModel && availableIds.has(requestedModel)) {
    return requestedModel;
  }
  const sessionModelFallback = normalizeModelId(input.sessionModelFallback);
  if (sessionModelFallback && availableIds.has(sessionModelFallback)) {
    return sessionModelFallback;
  }
  return availableModels[0]?.id ?? 'gpt-5.4';
}

export function resolveDefaultGeminiModeId(
  approvalPolicy?: ApprovalPolicy,
  configuredModeId?: unknown,
): string {
  const availableModes = resolveGeminiModeOptions(approvalPolicy);
  if (approvalPolicy === 'yolo' && availableModes.some((mode) => mode.id === 'yolo')) {
    return 'yolo';
  }
  const configuredMode = normalizeGeminiModeId(configuredModeId);
  if (configuredMode && availableModes.some((mode) => mode.id === configuredMode)) {
    return configuredMode;
  }
  return availableModes[0]?.id ?? DEFAULT_GEMINI_MODE_ID;
}

export function resolveAvailableGeminiModeId(input: {
  requestedMode?: unknown;
  approvalPolicy?: ApprovalPolicy;
  configuredModeId?: unknown;
}): string {
  const availableModes = resolveGeminiModeOptions(input.approvalPolicy);
  const availableIds = new Set(availableModes.map((mode) => mode.id));
  const requestedMode = normalizeGeminiModeId(input.requestedMode);
  if (requestedMode && availableIds.has(requestedMode)) {
    if (requestedMode === 'yolo' && input.approvalPolicy !== 'yolo') {
      return resolveDefaultGeminiModeId(input.approvalPolicy, input.configuredModeId);
    }
    return requestedMode;
  }
  return resolveDefaultGeminiModeId(input.approvalPolicy, input.configuredModeId);
}

export function isUserEvent(event: UiEvent): boolean {
  return event.meta?.role === 'user' || event.title === 'User Instruction';
}

export function isActionKind(kind: UiEventKind): kind is ActionKind {
  return kind === 'run_execution'
    || kind === 'exec_execution'
    || kind === 'git_execution'
    || kind === 'docker_execution'
    || kind === 'command_execution'
    || kind === 'file_list'
    || kind === 'file_read'
    || kind === 'file_write'
    || kind === 'think';
}

export function getEventKindMeta(
  kind: UiEventKind,
): { label: string; tone: Tone; Icon: ComponentType<{ size?: number }> } {
  const map: Record<UiEventKind, { label: string; tone: Tone; Icon: ComponentType<{ size?: number }> }> = {
    text_reply: { label: '', tone: 'sky', Icon: MessageSquareText },
    run_execution: { label: 'RUN', tone: 'amber', Icon: TerminalSquare },
    exec_execution: { label: 'EXEC', tone: 'red', Icon: TerminalSquare },
    git_execution: { label: 'GIT', tone: 'git', Icon: GitLogoIcon },
    docker_execution: { label: 'DOCKER', tone: 'docker', Icon: DockerLogoIcon },
    command_execution: { label: 'RUN', tone: 'amber', Icon: TerminalSquare },
    file_list: { label: 'LIST', tone: 'cyan', Icon: FolderTree },
    file_read: { label: 'READ', tone: 'violet', Icon: FileSearch },
    file_write: { label: 'WRITE', tone: 'emerald', Icon: FilePenLine },
    think: { label: 'THINK', tone: 'cyan', Icon: Brain },
    unknown: { label: 'EVENT', tone: 'red', Icon: CircleAlert },
  };
  return map[kind] || map.unknown;
}

export function isCommentaryEvent(event: UiEvent): boolean {
  const streamEvent = typeof event.meta?.streamEvent === 'string'
    ? event.meta.streamEvent.trim()
    : '';
  const phase = typeof event.meta?.messagePhase === 'string'
    ? event.meta.messagePhase.trim()
    : '';
  return streamEvent === 'agent_commentary' || streamEvent === 'agent_commentary_partial' || phase === 'commentary';
}

export function isPersistedPermissionEvent(event: UiEvent): boolean {
  const streamEvent = typeof event.meta?.streamEvent === 'string'
    ? event.meta.streamEvent.trim()
    : '';
  return streamEvent === 'permission_request' || streamEvent === 'permission_decision';
}

export function formatClock(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatRelative(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '알 수 없음';
  }

  const now = Date.now();
  const diffMinutes = Math.floor((now - date.getTime()) / 60000);
  if (diffMinutes < 1) return '방금 전';
  if (diffMinutes < 60) return `${diffMinutes}분 전`;

  const diffHours = Math.floor(diffMinutes / 60);
  if (diffHours < 24) return `${diffHours}시간 전`;

  return date.toLocaleDateString();
}

export function formatElapsedDuration(timestamp: string, nowMs = Date.now()): string {
  const startedAt = Date.parse(timestamp);
  if (!Number.isFinite(startedAt)) {
    return '--:--';
  }

  const diffSeconds = Math.max(0, Math.floor((nowMs - startedAt) / 1000));
  const hours = Math.floor(diffSeconds / 3600);
  const minutes = Math.floor((diffSeconds % 3600) / 60);
  const seconds = diffSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export function sortSessionChats(chats: SessionChat[]): SessionChat[] {
  return [...chats].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    const activityAt = b.lastActivityAt || b.createdAt;
    const aActivityAt = a.lastActivityAt || a.createdAt;
    const activityDiff = Date.parse(activityAt) - Date.parse(aActivityAt);
    if (Number.isFinite(activityDiff) && activityDiff !== 0) {
      return activityDiff;
    }
    const createdDiff = Date.parse(b.createdAt) - Date.parse(a.createdAt);
    if (Number.isFinite(createdDiff) && createdDiff !== 0) {
      return createdDiff;
    }
    return a.id.localeCompare(b.id);
  });
}

export function buildReadMarkerMap(chats: SessionChat[]): Record<string, string> {
  const markers: Record<string, string> = {};
  for (const chat of chats) {
    const marker = typeof chat.lastReadEventId === 'string' ? chat.lastReadEventId.trim() : '';
    if (marker) {
      markers[chat.id] = marker;
    }
  }
  return markers;
}

export function buildSnapshotSyncMap(chats: SessionChat[]): Record<string, string> {
  const synced: Record<string, string> = {};
  for (const chat of chats) {
    const latestEventId = typeof chat.latestEventId === 'string' ? chat.latestEventId.trim() : '';
    if (latestEventId) {
      synced[chat.id] = latestEventId;
    }
  }
  return synced;
}

export function buildSnapshotFromChat(chat: SessionChat): ChatSidebarSnapshot | null {
  const preview = typeof chat.latestPreview === 'string' ? chat.latestPreview : '';
  const latestEventId = typeof chat.latestEventId === 'string' && chat.latestEventId.trim()
    ? chat.latestEventId.trim()
    : null;
  const latestEventAt = typeof chat.latestEventAt === 'string' && chat.latestEventAt.trim()
    ? chat.latestEventAt
    : null;
  const hasEvents = Boolean(latestEventId) || preview.trim().length > 0;
  if (!hasEvents) {
    return null;
  }
  return {
    preview,
    hasEvents: true,
    hasErrorSignal: Boolean(chat.latestHasErrorSignal),
    latestEventId,
    latestEventAt,
    latestEventIsUser: Boolean(chat.latestEventIsUser),
    isRunning: false,
  };
}

export function truncateSingleLine(input: string, max = 68): string {
  const compact = input.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max).trimEnd()}…`;
}

export function isAutoGeneratedChatTitle(title: string): boolean {
  return /^새 채팅(?:\s+\d+)?$/.test(title.trim());
}

export function buildChatTitleFromFirstPrompt(input: string): string {
  const compact = input.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '새 채팅';
  }
  return compact.slice(0, 120);
}

export function extractResourceLabels(source: string): ResourceLabel[] {
  const normalized = source.replace(/\r\n/g, '\n');
  const resources: ResourceLabel[] = [];
  const seen = new Set<string>();

  for (const match of scanMarkdownLinks(normalized)) {
    const resource = classifyLabelLink(match.label, match.target);
    if (!resource) {
      continue;
    }
    const dedupeKey = `${resource.kind}:${resource.name}:${resource.sourcePath ?? ''}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);
    resources.push(resource);
  }

  return resources;
}

export function extractResourceLabelsFromEvent(event: UiEvent): ResourceLabel[] {
  const resources = extractResourceLabels([event.body, event.title].filter(Boolean).join('\n'));
  const pathResource = typeof event.action?.path === 'string' ? classifyPath(event.action.path) : null;
  if (!pathResource) {
    return resources;
  }

  const dedupeKey = `${pathResource.kind}:${pathResource.name}:${pathResource.sourcePath ?? ''}`;
  if (resources.some((item) => `${item.kind}:${item.name}:${item.sourcePath ?? ''}` === dedupeKey)) {
    return resources;
  }
  return [...resources, pathResource];
}

export function buildPreview(text: string): UiEventResult | undefined {
  const normalized = text.replace(/\r\n/g, '\n').trimEnd();
  if (!normalized) {
    return undefined;
  }

  const lines = normalized.split('\n');
  const lineLimited = lines.slice(0, PREVIEW_MAX_LINES).join('\n');
  const charLimited = lineLimited.slice(0, PREVIEW_MAX_CHARS);
  const truncated = lines.length > PREVIEW_MAX_LINES || normalized.length > PREVIEW_MAX_CHARS;

  return {
    preview: truncated ? `${charLimited.trimEnd()}\n…` : normalized,
    full: truncated ? normalized : undefined,
    truncated,
    totalLines: lines.length,
    shownLines: Math.min(lines.length, PREVIEW_MAX_LINES),
  };
}

export function fallbackResult(event: UiEvent): UiEventResult | undefined {
  const body = event.body.replace(/\r\n/g, '\n');
  if (!body.trim()) {
    return undefined;
  }

  if (isActionKind(event.kind)) {
    const lines = body.split('\n');
    if (lines.length > 1) {
      return buildPreview(lines.slice(1).join('\n'));
    }
  }

  return buildPreview(body);
}

export function resolveActionPrimary(event: UiEvent): string {
  if (event.action?.command) {
    return event.action.command;
  }
  if (event.action?.path) {
    return event.action.path;
  }

  const firstLine = event.body.split('\n')[0]?.trim() ?? '';
  if (!firstLine) {
    return event.title || event.kind;
  }

  return firstLine.startsWith('$ ') ? firstLine.slice(2).trim() : firstLine;
}

export function resolveRecentSummary(event: UiEvent): string {
  if (isUserEvent(event)) {
    return truncateSingleLine(event.body || event.title || '사용자 메시지');
  }

  const primary = resolveActionPrimary(event);
  if (primary) {
    return truncateSingleLine(primary);
  }

  return truncateSingleLine(event.title || event.kind);
}

export function getLatestVisibleEvent(events: UiEvent[]): UiEvent | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!isRunLifecycleEvent(event)) {
      return event;
    }
  }
  return null;
}

export function extractProgressMeta(events: UiEvent[]): { step?: number; elapsedMs?: number; modelLabel?: string } | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event?.meta) continue;
    const step = typeof event.meta.step === 'number' ? event.meta.step : undefined;
    const elapsedMs = typeof event.meta.elapsedMs === 'number' ? event.meta.elapsedMs : undefined;
    const modelLabel = typeof event.meta.modelLabel === 'string' ? event.meta.modelLabel : undefined;
    if (step !== undefined || modelLabel !== undefined) {
      return { step, elapsedMs, modelLabel };
    }
  }
  return null;
}

export function buildProgressLabel(
  base: string,
  progress: { step?: number; elapsedMs?: number; modelLabel?: string } | null,
): string {
  if (!progress) return base;
  const parts: string[] = ['working'];
  if (progress.modelLabel) parts.push(progress.modelLabel);
  if (progress.elapsedMs !== undefined) parts.push(`${Math.floor(progress.elapsedMs / 1000)}s`);
  if (progress.step !== undefined && progress.step > 0) parts.push(`step ${progress.step}`);
  return parts.length > 1 ? parts.join(' · ') : base;
}

export function hasChatErrorSignal(event: UiEvent | null | undefined): boolean {
  if (!event) {
    return false;
  }

  const streamEvent = readUiEventStreamEvent(event);
  if (
    streamEvent === 'runtime_disconnected'
    || streamEvent === 'stream_error'
    || streamEvent === 'runtime_error'
  ) {
    return true;
  }
  if (streamEvent === 'run_status') {
    const runStatus = readUiEventRunStatus(event);
    return isTerminalRunStatus(runStatus) && runStatus !== 'completed';
  }
  return false;
}

export function approvalPolicyLabel(value?: ApprovalPolicy): string {
  if (value === 'on-failure') {
    return 'ON FAILURE';
  }
  if (value === 'never') {
    return 'NEVER';
  }
  if (value === 'yolo') {
    return 'YOLO';
  }
  return 'ON REQUEST';
}

export function fileNameOnly(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/').trim();
  if (!normalized) {
    return normalized;
  }
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

export function parseCodeChangeSummary(event: UiEvent): {
  files: string[];
  additions: number;
  deletions: number;
  hunks: Array<{ file: string; fullPath: string; line: number; additions: number; deletions: number }>;
  previewLines: string[];
  fullText: string;
  hasDiffSignal: boolean;
} {
  const fallback = fallbackResult(event);
  const fullText = (event.result?.full ?? event.result?.preview ?? fallback?.full ?? fallback?.preview ?? event.body ?? '')
    .replace(/\r\n/g, '\n')
    .trimEnd();
  const lines = fullText ? fullText.split('\n') : [];
  const files = new Set<string>();
  let computedAdditions = 0;
  let computedDeletions = 0;
  let hasStructuralDiffSignal = false;
  let currentDiffFile: string | null = null;
  const parsedHunks: Array<{ file: string; fullPath: string; line: number; additions: number; deletions: number }> = [];
  let activeHunkIndex = -1;

  for (const line of lines) {
    const normalized = line.trim();
    const lowered = normalized.toLowerCase();
    if (
      normalized.startsWith('diff --git ')
      || normalized.startsWith('@@ ')
      || lowered.startsWith('*** begin patch')
      || lowered.startsWith('*** update file:')
      || lowered.startsWith('*** add file:')
      || lowered.startsWith('*** delete file:')
    ) {
      hasStructuralDiffSignal = true;
    }
    const gitFileMatch = normalized.match(/^(?:\+\+\+|---)\s+[ab]\/(.+)$/);
    if (gitFileMatch?.[1]) {
      files.add(gitFileMatch[1]);
      if (normalized.startsWith('+++ ')) {
        currentDiffFile = gitFileMatch[1];
        activeHunkIndex = -1;
      }
      hasStructuralDiffSignal = true;
    }
    const diffFileMatch = normalized.match(/^diff --git\s+a\/(.+)\s+b\/(.+)$/);
    if (diffFileMatch?.[2]) {
      currentDiffFile = diffFileMatch[2];
      files.add(diffFileMatch[2]);
      hasStructuralDiffSignal = true;
      activeHunkIndex = -1;
    }
    const patchFileMatch = normalized.match(/^\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+)$/);
    if (patchFileMatch?.[1]) {
      files.add(patchFileMatch[1]);
      currentDiffFile = patchFileMatch[1];
      hasStructuralDiffSignal = true;
      activeHunkIndex = -1;
    }
    const hunkMatch = normalized.match(/^@@\s+-\d+(?:,\d+)?\s+\+(\d+)(?:,\d+)?\s+@@/);
    if (hunkMatch) {
      const parsed = Number.parseInt(hunkMatch[1], 10);
      if (Number.isFinite(parsed)) {
        parsedHunks.push({
          file: currentDiffFile ?? event.action?.path ?? '',
          fullPath: currentDiffFile ?? event.action?.path ?? '',
          line: parsed,
          additions: 0,
          deletions: 0,
        });
        activeHunkIndex = parsedHunks.length - 1;
      } else {
        activeHunkIndex = -1;
      }
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      computedAdditions += 1;
      if (activeHunkIndex >= 0) {
        parsedHunks[activeHunkIndex].additions += 1;
      }
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      computedDeletions += 1;
      if (activeHunkIndex >= 0) {
        parsedHunks[activeHunkIndex].deletions += 1;
      }
    }
  }

  const meta = event.meta ?? {};
  const metaAdditionsValue = meta.additions;
  const metaDeletionsValue = meta.deletions;
  const metaHasDiffSignalValue = meta.hasDiffSignal;

  const metaAdditions = typeof metaAdditionsValue === 'number' && Number.isFinite(metaAdditionsValue)
    ? metaAdditionsValue
    : null;
  const metaDeletions = typeof metaDeletionsValue === 'number' && Number.isFinite(metaDeletionsValue)
    ? metaDeletionsValue
    : null;
  const metaHasDiffSignal = typeof metaHasDiffSignalValue === 'boolean'
    ? metaHasDiffSignalValue
    : null;

  const additions = metaAdditions ?? computedAdditions;
  const deletions = metaDeletions ?? computedDeletions;
  const hasDiffSignal = metaHasDiffSignal ?? hasStructuralDiffSignal;

  if (files.size === 0 && event.action?.path) {
    files.add(event.action.path);
  }
  const fallbackFile = [...files][0] ?? event.action?.path ?? '';
  const hunks = parsedHunks.map((hunk) => ({
    ...hunk,
    file: fileNameOnly(hunk.file || fallbackFile),
    fullPath: hunk.fullPath || fallbackFile,
  }));

  const previewCandidates = lines.filter((line) => (
    line.startsWith('+')
    || line.startsWith('-')
    || line.startsWith('@@')
    || line.startsWith('*** ')
    || line.startsWith('diff --git')
  ));
  const previewLines = (previewCandidates.length > 0 ? previewCandidates : lines).slice(0, 12);

  return {
    files: [...files],
    additions,
    deletions,
    hunks,
    previewLines,
    fullText,
    hasDiffSignal,
  };
}

export function buildStreamRenderItems(
  events: UiEvent[],
  expandedActionRunIds: Record<string, boolean>,
): StreamRenderItem[] {
  const items: StreamRenderItem[] = [];
  let cursor = 0;

  while (cursor < events.length) {
    const current = events[cursor];
    if (isUserEvent(current) || !isActionKind(current.kind)) {
      items.push({ type: 'event', event: current });
      cursor += 1;
      continue;
    }

    const runKind: ActionKind = current.kind;
    let end = cursor + 1;
    while (end < events.length) {
      const next = events[end];
      if (isUserEvent(next) || !isActionKind(next.kind) || next.kind !== runKind) {
        break;
      }
      end += 1;
    }

    const runEvents = events.slice(cursor, end);
    if (runEvents.length < ACTION_COLLAPSE_THRESHOLD) {
      runEvents.forEach((event) => items.push({ type: 'event', event }));
      cursor = end;
      continue;
    }

    const firstEvent = runEvents[0];
    const lastEvent = runEvents[runEvents.length - 1];
    const runId = `${runKind}:${firstEvent.id}`;
    const hiddenCount = Math.max(1, runEvents.length - 2);
    const expanded = Boolean(expandedActionRunIds[runId]);

    if (expanded) {
      runEvents.forEach((event) => items.push({ type: 'event', event }));
      items.push({
        type: 'action_overflow',
        id: `${runId}:toggle`,
        runId,
        kind: runKind,
        hiddenCount,
        expanded: true,
        timestamp: firstEvent.timestamp,
      });
      cursor = end;
      continue;
    }

    items.push({ type: 'event', event: firstEvent });
    items.push({
      type: 'action_overflow',
      id: `${runKind}:${firstEvent.id}:${lastEvent.id}`,
      runId,
      kind: runKind,
      hiddenCount,
      expanded: false,
      timestamp: firstEvent.timestamp,
    });
    items.push({ type: 'event', event: lastEvent });

    cursor = end;
  }

  return items;
}

export function getWindowScrollTop(): number {
  return Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);
}

export {
  CHAT_SIDEBAR_SECTION_LABELS,
  DEFAULT_CHAT_RUNTIME_UI_STATE,
};
