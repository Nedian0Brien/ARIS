import type { ComponentType } from 'react';
import {
  Brain,
  CircleAlert,
  FilePenLine,
  FileSearch,
  FolderTree,
  MessageSquareText,
  TerminalSquare,
} from 'lucide-react';
import {
  isRunLifecycleEvent,
  isTerminalRunStatus,
  readUiEventRunStatus,
  readUiEventStreamEvent,
} from '@/lib/happy/chatRuntime';
import type {
  ApprovalPolicy,
  ChatImageAttachment,
  SessionChat,
  UiEvent,
  UiEventKind,
  UiEventResult,
} from '@/lib/happy/types';
import { DockerLogoIcon, GitLogoIcon } from '@/components/ui/AgentIcons';
import {
  ACTION_COLLAPSE_THRESHOLD,
  CHAT_SIDEBAR_SECTION_LABELS,
  DEFAULT_CHAT_RUNTIME_UI_STATE,
  PREVIEW_MAX_CHARS,
  PREVIEW_MAX_LINES,
} from './constants';
import type {
  ActionKind,
  ChatSidebarSnapshot,
  ContextItem,
  FolderLabel,
  ResourceLabel,
  StreamRenderItem,
  Tone,
} from './types';
import { FOLDER_LABELS } from './types';
import {
  normalizeLocalPathTarget,
  parseLocalFileReferenceTarget,
  scanMarkdownLinks,
} from '../chatFileReferences';
export {
  buildChatUrl,
  copyTextToClipboard,
  dispatchWorkspaceFileOpen,
  getFileIcon,
  getRecentFiles,
  isWorkspacePathWithinRoot,
  joinWorkspacePath,
  normalizeWorkspaceClientPath,
  readChatIdFromLocation,
  saveRecentFile,
  writeChatIdToHistory,
} from './browserHelpers';
export {
  deriveGeminiModeLabel,
  normalizeAgentFlavor,
  normalizeGeminiModeId,
  normalizeModelId,
  normalizeModelReasoningEffort,
  resolveAgentMeta,
  resolveAgentSubtitle,
  resolveAvailableComposerModelId,
  resolveAvailableGeminiModeId,
  resolveComposerModels,
  resolveDefaultGeminiModeId,
  resolveDefaultModelId,
  resolveGeminiModeOptions,
} from './modelHelpers';

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
