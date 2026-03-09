'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useSessionEvents } from '@/lib/hooks/useSessionEvents';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useSessionRuntime } from '@/lib/hooks/useSessionRuntime';
import { BackendNotice } from '@/components/ui/BackendNotice';
import {
  Activity,
  AlignLeft,
  ArrowUp,
  CheckCircle2,
  CornerDownRight,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  CircleAlert,
  Clock,
  Cpu,
  File,
  FileCode,
  FilePenLine,
  FileSearch,
  FileText,
  Folder,
  FolderTree,
  MessageSquarePlus,
  MessageSquareText,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
  Paperclip,
  Pencil,
  Pin,
  Plus,
  Square,
  TerminalSquare,
  Trash2,
  X,
} from 'lucide-react';
import { createPortal } from 'react-dom';
import type { AgentFlavor, ApprovalPolicy, PermissionRequest, SessionChat, UiEvent, UiEventKind, UiEventResult } from '@/lib/happy/types';
import { ClaudeIcon, GeminiIcon, CodexIcon, GitLogoIcon, DockerLogoIcon } from '@/components/ui/AgentIcons';
import { PermissionRequestMessage } from './PermissionRequestMessage';
import styles from './ChatInterface.module.css';
import dynamic from 'next/dynamic';

// SSR을 비활성화해 react-syntax-highlighter의 window 참조 오류 방지
const SyntaxHighlighter = dynamic(
  () => import('./CodeHighlighter').then((m) => m.CodeHighlighter),
  { ssr: false, loading: () => null }
);

// --- 1. 기본 상수 및 설정 (TDZ 방지를 위해 최상단에 배치) ---

const AGENT_REPLY_TIMEOUT_MS = 90000;
const RUNTIME_DISCONNECT_GRACE_MS = 4000;
const AUTO_SCROLL_THRESHOLD_PX = 80;
const MOBILE_LAYOUT_MAX_WIDTH_PX = 960;
const PREVIEW_MAX_LINES = 12;
const PREVIEW_MAX_CHARS = 600;
const COMPOSER_MIN_HEIGHT_PX = 36;
const RECENT_FILES_STORAGE_KEY = 'aris:recent-file-attachments';
const RECENT_FILES_MAX = 5;

function getRecentFiles(): string[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_FILES_STORAGE_KEY) ?? '[]') as string[];
  } catch { return []; }
}

function saveRecentFile(filePath: string): void {
  try {
    const prev = getRecentFiles().filter((p) => p !== filePath);
    localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify([filePath, ...prev].slice(0, RECENT_FILES_MAX)));
  } catch { /* localStorage 사용 불가 시 무시 */ }
}

function getFileIcon(name: string, isDirectory: boolean): React.ReactNode {
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
const COMPOSER_MAX_HEIGHT_PX = 180;
const ACTION_COLLAPSE_THRESHOLD = 4;
const READ_CURSOR_SYNC_DEBOUNCE_MS = 800;
const SIDEBAR_CHAT_PAGE_SIZE = 7;
const SIDEBAR_RECENTS_LIMIT = 7;
const SIDEBAR_APPROVAL_FEEDBACK_MS = 3000;
const CHAT_AGENT_CHOICES: AgentFlavor[] = ['codex', 'claude', 'gemini'];

const FOLDER_LABELS = ['src', 'tools', 'jobs', 'scripts', 'tests'] as const;
const COMPOSER_MODELS = [
  { id: 'claude-sonnet-4-6', shortLabel: 'Sonnet 4.6', badge: '권장' },
  { id: 'claude-opus-4-6', shortLabel: 'Opus 4.6', badge: '최고 성능' },
  { id: 'claude-haiku-4-5', shortLabel: 'Haiku 4.5', badge: '빠름' },
] as const;

// --- 2. 타입 정의 ---

type AgentMeta = {
  label: string;
  tone: 'clay' | 'mint' | 'blue';
  Icon: React.ComponentType<{ size?: number }>;
};

type Tone = 'sky' | 'amber' | 'cyan' | 'emerald' | 'violet' | 'red' | 'git' | 'docker';
type ActionKind = 'run_execution' | 'exec_execution' | 'git_execution' | 'docker_execution' | 'command_execution' | 'file_list' | 'file_read' | 'file_write';
type StreamRenderItem =
  | { type: 'event'; event: UiEvent }
  | { type: 'action_overflow'; id: string; runId: string; kind: ActionKind; hiddenCount: number; expanded: boolean; timestamp: string };
type TimelineRenderItem =
  | { type: 'stream'; item: StreamRenderItem; sortKey: number; order: number }
  | { type: 'permission'; permission: PermissionRequest; sortKey: number; order: number };
type ResourceLabel =
  | { kind: 'folder'; name: FolderLabel; sourcePath?: string }
  | { kind: 'file'; name: string; extension: string; sourcePath?: string };
type FolderLabel = (typeof FOLDER_LABELS)[number];
type ComposerModelId = (typeof COMPOSER_MODELS)[number]['id'];

type ContextItem =
  | { id: string; type: 'file'; path: string; content: string; name: string }
  | { id: string; type: 'text'; text: string };
type ChatSidebarState = 'default' | 'running' | 'completed' | 'approval' | 'error';
type ChatSidebarSnapshot = {
  preview: string;
  hasEvents: boolean;
  hasErrorSignal: boolean;
};
type ChatApprovalFeedback = 'approved' | 'denied';

// --- 3. 런타임 초기화 안전 장치 (TDZ 에러 방지) ---
// styles 객체 및 복잡한 객체 참조를 함수 호출 시점으로 지연시킴

function getToneClass(tone: Tone): string {
  const map: Record<Tone, string> = {
    sky: styles.toneSky,
    amber: styles.toneAmber,
    cyan: styles.toneCyan,
    emerald: styles.toneEmerald,
    violet: styles.toneViolet,
    red: styles.toneRed,
    git: styles.toneGit,
    docker: styles.toneDocker,
  };
  return map[tone] || '';
}

function getAgentAvatarToneClass(tone: AgentMeta['tone']): string {
  const map: Record<AgentMeta['tone'], string> = {
    clay: styles.agentAvatarClay,
    mint: styles.agentAvatarMint,
    blue: styles.agentAvatarBlue,
  };
  return map[tone] || '';
}

function getEventKindMeta(kind: UiEventKind): { label: string; tone: Tone; Icon: React.ComponentType<{ size?: number }> } {
  const map: Record<UiEventKind, { label: string; tone: Tone; Icon: React.ComponentType<{ size?: number }> }> = {
    text_reply: { label: '', tone: 'sky', Icon: MessageSquareText },
    run_execution: { label: 'RUN', tone: 'amber', Icon: TerminalSquare },
    exec_execution: { label: 'EXEC', tone: 'red', Icon: TerminalSquare },
    git_execution: { label: 'GIT', tone: 'git', Icon: GitLogoIcon },
    docker_execution: { label: 'DOCKER', tone: 'docker', Icon: DockerLogoIcon },
    command_execution: { label: 'RUN', tone: 'amber', Icon: TerminalSquare },
    file_list: { label: 'LIST', tone: 'cyan', Icon: FolderTree },
    file_read: { label: 'READ', tone: 'violet', Icon: FileSearch },
    file_write: { label: 'WRITE', tone: 'emerald', Icon: FilePenLine },
    unknown: { label: 'EVENT', tone: 'red', Icon: CircleAlert },
  };
  return map[kind] || map.unknown;
}

// --- 4. Hydration 안전 컴포넌트 ---

function RelativeTime({ timestamp, className }: { timestamp: string; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    const date = new Date(timestamp);
    return <span className={className}>{Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>;
  }

  return <span className={className}>{formatRelative(timestamp)}</span>;
}

// --- 5. 유틸리티 함수 ---

function genId(): string {
  return Math.random().toString(36).slice(2, 9);
}

function isFolderLabel(label: string): label is FolderLabel {
  return (FOLDER_LABELS as readonly string[]).includes(label);
}

function isLinkForLabelPath(url: string): boolean {
  return /^https?:\/\//i.test(url) || /^file:\/\//i.test(url) || /^\/?[\w./-]+$/.test(url);
}

function fileExtension(filename: string): string {
  const base = filename.trim().split('/').pop() ?? '';
  const dotIndex = base.lastIndexOf('.');
  if (dotIndex <= 0 || dotIndex === base.length - 1) {
    return '';
  }
  return base.slice(dotIndex + 1).toLowerCase();
}

function classifyLabelLink(label: string, rawPath: string): ResourceLabel | null {
  const normalizedLabel = label.trim();
  if (!normalizedLabel || !isLinkForLabelPath(rawPath)) {
    return null;
  }

  const folderCandidate = normalizedLabel.toLowerCase();
  if (isFolderLabel(folderCandidate)) {
    return { kind: 'folder', name: folderCandidate as FolderLabel, sourcePath: rawPath };
  }

  const extension = fileExtension(normalizedLabel);
  if (extension) {
    return { kind: 'file', name: normalizedLabel, extension, sourcePath: rawPath };
  }

  return null;
}

function classifyPath(pathValue: string): ResourceLabel | null {
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

function resolveAgentMeta(agentFlavor: string): AgentMeta {
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

function normalizeAgentFlavor(value: unknown, fallback: AgentFlavor = 'codex'): AgentFlavor {
  if (value === 'claude' || value === 'codex' || value === 'gemini') {
    return value;
  }
  return fallback;
}

function isUserEvent(event: UiEvent): boolean {
  return event.meta?.role === 'user' || event.title === 'User Instruction';
}

function isActionKind(kind: UiEventKind): kind is ActionKind {
  return kind === 'run_execution'
    || kind === 'exec_execution'
    || kind === 'git_execution'
    || kind === 'docker_execution'
    || kind === 'command_execution'
    || kind === 'file_list'
    || kind === 'file_read'
    || kind === 'file_write';
}

function formatClock(timestamp: string): string {
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) {
    return '--:--';
  }
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function formatRelative(timestamp: string): string {
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

function sortSessionChats(chats: SessionChat[]): SessionChat[] {
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

function truncateSingleLine(input: string, max = 68): string {
  const compact = input.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max).trimEnd()}…`;
}

function isAutoGeneratedChatTitle(title: string): boolean {
  return /^새 채팅(?:\s+\d+)?$/.test(title.trim());
}

function buildChatTitleFromFirstPrompt(input: string): string {
  const compact = input.replace(/\s+/g, ' ').trim();
  if (!compact) {
    return '새 채팅';
  }
  return compact.slice(0, 120);
}

function extractResourceLabels(source: string): ResourceLabel[] {
  const normalized = source.replace(/\r\n/g, '\n');
  const resources: ResourceLabel[] = [];
  const seen = new Set<string>();

  for (const match of normalized.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    const label = match[1];
    const rawPath = match[2];
    const resource = classifyLabelLink(label, rawPath);
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

function extractResourceLabelsFromEvent(event: UiEvent): ResourceLabel[] {
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

function buildPreview(text: string): UiEventResult | undefined {
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

function fallbackResult(event: UiEvent): UiEventResult | undefined {
  const body = event.body.replace(/\r\n/g, '\n');
  if (!body.trim()) {
    return undefined;
  }

  const lines = body.split('\n');
  if (isActionKind(event.kind) && lines.length > 1) {
    return buildPreview(lines.slice(1).join('\n'));
  }

  return buildPreview(body);
}

function resolveActionPrimary(event: UiEvent): string {
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

function resolveRecentSummary(event: UiEvent): string {
  if (isUserEvent(event)) {
    return truncateSingleLine(event.body || event.title || '사용자 메시지');
  }

  const primary = resolveActionPrimary(event);
  if (primary) {
    return truncateSingleLine(primary);
  }

  return truncateSingleLine(event.title || event.kind);
}

function hasChatErrorSignal(event: UiEvent | null | undefined): boolean {
  if (!event) {
    return false;
  }

  const streamEvent = typeof event.meta?.streamEvent === 'string'
    ? event.meta.streamEvent.toLowerCase()
    : '';
  if (streamEvent.includes('disconnect') || streamEvent.includes('error')) {
    return true;
  }
  if (event.severity === 'danger') {
    return true;
  }

  const normalized = `${event.title} ${event.body}`.toLowerCase();
  return normalized.includes('error') || normalized.includes('실패') || normalized.includes('끊김');
}

function approvalPolicyLabel(value?: ApprovalPolicy): string {
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

function fileNameOnly(pathValue: string): string {
  const normalized = pathValue.replace(/\\/g, '/').trim();
  if (!normalized) {
    return normalized;
  }
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
}

function parseCodeChangeSummary(event: UiEvent): {
  files: string[];
  additions: number;
  deletions: number;
  hunks: Array<{ file: string; line: number; additions: number; deletions: number }>;
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
  const parsedHunks: Array<{ file: string; line: number; additions: number; deletions: number }> = [];
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

function buildStreamRenderItems(events: UiEvent[], expandedActionRunIds: Record<string, boolean>): StreamRenderItem[] {
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

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_THRESHOLD_PX;
}

function getWindowScrollTop(): number {
  return Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);
}

function isNearWindowBottom(): boolean {
  const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
  const scrollTop = getWindowScrollTop();
  const scrollHeight = Math.max(
    document.documentElement.scrollHeight,
    document.body.scrollHeight,
  );
  return scrollHeight - (scrollTop + viewportHeight) <= AUTO_SCROLL_THRESHOLD_PX;
}

// --- 6. 컴포넌트 내부 헬퍼 함수 ---

function parseMarkdownTableRow(line: string): string[] {
  const trimmed = line.trim();
  if (!trimmed.includes('|')) {
    return [];
  }

  let normalized = trimmed;
  if (normalized.startsWith('|')) {
    normalized = normalized.slice(1);
  }
  if (normalized.endsWith('|')) {
    normalized = normalized.slice(0, -1);
  }

  return normalized
    .split('|')
    .map((cell) => cell.trim().replace(/\\\|/g, '|'));
}

function isMarkdownTableDelimiterLine(line: string): boolean {
  const cells = parseMarkdownTableRow(line);
  if (cells.length === 0) {
    return false;
  }
  return cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

type TableAlign = 'left' | 'center' | 'right' | null;

function parseMarkdownTableAlignments(delimiterLine: string, columns: number): TableAlign[] {
  const cells = parseMarkdownTableRow(delimiterLine);
  const alignments: TableAlign[] = [];
  for (let index = 0; index < columns; index += 1) {
    const cell = (cells[index] ?? '').trim();
    if (/^:-{3,}:$/.test(cell)) {
      alignments.push('center');
      continue;
    }
    if (/^-{3,}:$/.test(cell)) {
      alignments.push('right');
      continue;
    }
    if (/^:-{3,}$/.test(cell)) {
      alignments.push('left');
      continue;
    }
    alignments.push(null);
  }
  return alignments;
}

function normalizeMarkdownTableRow(cells: string[], columns: number): string[] {
  const normalized = [...cells];
  if (normalized.length < columns) {
    for (let index = normalized.length; index < columns; index += 1) {
      normalized.push('');
    }
  }
  if (normalized.length > columns) {
    normalized.length = columns;
  }
  return normalized;
}

function isMarkdownTableStart(lines: string[], index: number): boolean {
  if (index + 1 >= lines.length) {
    return false;
  }

  const headerCells = parseMarkdownTableRow(lines[index]);
  if (headerCells.length === 0 || headerCells.every((cell) => !cell)) {
    return false;
  }

  return isMarkdownTableDelimiterLine(lines[index + 1]);
}

function isMarkdownBoundary(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed) {
    return true;
  }
  return (
    trimmed.startsWith('```') ||
    /^#{1,4}\s+/.test(trimmed) ||
    /^>\s?/.test(trimmed) ||
    /^[-*+]\s+/.test(trimmed) ||
    /^\d+\.\s+/.test(trimmed)
  );
}

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; start: number; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; headers: string[]; rows: string[][]; alignments: TableAlign[] };

function parseMarkdownBlocks(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: MarkdownBlock[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      i += 1;
      continue;
    }

    if (trimmed.startsWith('```')) {
      const language = trimmed.slice(3).trim();
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i += 1;
      }
      if (i < lines.length && lines[i].trim().startsWith('```')) {
        i += 1;
      }
      blocks.push({ type: 'code', language, code: codeLines.join('\n') });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      const level = Math.min(4, headingMatch[1].length) as 1 | 2 | 3 | 4;
      blocks.push({ type: 'heading', level, text: headingMatch[2].trim() });
      i += 1;
      continue;
    }

    if (isMarkdownTableStart(lines, i)) {
      const headerCells = parseMarkdownTableRow(lines[i]);
      const delimiterCells = parseMarkdownTableRow(lines[i + 1]);
      const columns = Math.max(headerCells.length, delimiterCells.length);
      const headers = normalizeMarkdownTableRow(headerCells, columns);
      const alignments = parseMarkdownTableAlignments(lines[i + 1], columns);
      i += 2;

      const rows: string[][] = [];
      while (i < lines.length) {
        const rowLine = lines[i];
        if (!rowLine.trim()) {
          break;
        }
        if (isMarkdownBoundary(rowLine)) {
          break;
        }

        const rowCells = parseMarkdownTableRow(rowLine);
        if (rowCells.length === 0) {
          break;
        }
        rows.push(normalizeMarkdownTableRow(rowCells, columns));
        i += 1;
      }

      blocks.push({ type: 'table', headers, rows, alignments });
      continue;
    }

    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''));
        i += 1;
      }
      blocks.push({ type: 'quote', text: quoteLines.join('\n').trim() });
      continue;
    }

    if (/^[-*+]\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i].trim();
        const match = current.match(/^[-*+]\s+(.+)$/);
        if (match) {
          items.push(match[1]);
          i += 1;
          continue;
        }
        if (!current) {
          let lookahead = i + 1;
          while (lookahead < lines.length && !lines[lookahead].trim()) {
            lookahead += 1;
          }
          if (lookahead < lines.length && /^[-*+]\s+/.test(lines[lookahead].trim())) {
            i = lookahead;
            continue;
          }
        }
        break;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const start = Number.parseInt(trimmed.match(/^(\d+)\.\s+/)?.[1] ?? '1', 10);
      const items: string[] = [];
      while (i < lines.length) {
        const current = lines[i].trim();
        const match = current.match(/^\d+\.\s+(.+)$/);
        if (match) {
          items.push(match[1]);
          i += 1;
          continue;
        }
        if (!current) {
          let lookahead = i + 1;
          while (lookahead < lines.length && !lines[lookahead].trim()) {
            lookahead += 1;
          }
          if (lookahead < lines.length && /^\d+\.\s+/.test(lines[lookahead].trim())) {
            i = lookahead;
            continue;
          }
        }
        break;
      }
      blocks.push({ type: 'ol', start: Number.isFinite(start) && start > 0 ? start : 1, items });
      continue;
    }

    const paragraphLines: string[] = [];
    while (i < lines.length && lines[i].trim() && !isMarkdownBoundary(lines[i])) {
      if (isMarkdownTableStart(lines, i)) {
        break;
      }
      paragraphLines.push(lines[i]);
      i += 1;
    }
    if (paragraphLines.length === 0) {
      paragraphLines.push(line);
      i += 1;
    }
    blocks.push({ type: 'paragraph', text: paragraphLines.join('\n').trim() });
  }

  return blocks;
}

function renderInlineMarkdown(text: string, keyPrefix: string): ReactNode[] {
  const pattern = /(\[([^\]]+)\]\(([^)\s]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_)/g;
  const result: ReactNode[] = [];
  let cursor = 0;
  let token = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      result.push(text.slice(cursor, index));
    }

    if (match[2] && match[3]) {
      const resource = classifyLabelLink(match[2], match[3]);
      if (resource) {
        result.push(<InlineResourceChip key={`${keyPrefix}-resource-${token}`} resource={resource} />);
      } else {
        result.push(
          <a
            key={`${keyPrefix}-link-${token}`}
            className={styles.markdownLink}
            href={match[3]}
            target="_blank"
            rel="noreferrer noopener"
          >
          {match[2]}
          </a>
        );
      }
    } else if (match[4]) {
      result.push(
        <code key={`${keyPrefix}-code-${token}`} className={styles.markdownInlineCode}>
          {match[4]}
        </code>
      );
    } else if (match[5] || match[6]) {
      result.push(
        <strong key={`${keyPrefix}-strong-${token}`} className={styles.markdownStrong}>
          {match[5] || match[6]}
        </strong>
      );
    } else if (match[7] || match[8]) {
      result.push(
        <em key={`${keyPrefix}-em-${token}`} className={styles.markdownEmphasis}>
          {match[7] || match[8]}
        </em>
      );
    }

    cursor = index + match[0].length;
    token += 1;
  }

  if (cursor < text.length) {
    result.push(text.slice(cursor));
  }

  if (result.length === 0) {
    result.push(text);
  }

  return result;
}

function resolveFileIconMeta(extension: string): { Icon: React.ComponentType<{ size?: number }>; iconClassName: string } {
  const ext = extension.toLowerCase();
  if (ext === 'py' || ext === 'sh' || ext === 'bash' || ext === 'zsh') {
    return { Icon: TerminalSquare, iconClassName: styles.resourceIconShell };
  }
  if (ext === 'ts' || ext === 'tsx' || ext === 'js' || ext === 'jsx') {
    return { Icon: FilePenLine, iconClassName: styles.resourceIconCode };
  }
  if (ext === 'json' || ext === 'yml' || ext === 'yaml' || ext === 'toml') {
    return { Icon: FileSearch, iconClassName: styles.resourceIconConfig };
  }
  if (ext === 'md' || ext === 'txt' || ext === 'rst') {
    return { Icon: MessageSquareText, iconClassName: styles.resourceIconDoc };
  }
  return { Icon: FileSearch, iconClassName: styles.resourceIconOther };
}

function ResourceChip({ resource }: { resource: ResourceLabel }) {
  if (resource.kind === 'folder') {
    return (
      <span className={`${styles.resourceChip} ${styles.resourceChipFolder}`} title={resource.sourcePath}>
        <span className={`${styles.resourceChipIcon} ${styles.resourceIconFolder}`}>
          <FolderTree size={12} />
        </span>
        <span className={styles.resourceChipText}>{resource.name}</span>
      </span>
    );
  }

  const { Icon, iconClassName } = resolveFileIconMeta(resource.extension);
  return (
    <span className={`${styles.resourceChip} ${styles.resourceChipFile}`} title={resource.sourcePath}>
      <span className={`${styles.resourceChipIcon} ${iconClassName}`}>
        <Icon size={12} />
      </span>
      <span className={styles.resourceChipText}>{resource.name}</span>
    </span>
  );
}

function InlineResourceChip({ resource }: { resource: ResourceLabel }) {
  return (
    <span className={styles.inlineResourceChipWrap}>
      <ResourceChip resource={resource} />
    </span>
  );
}

function renderInlineWithBreaks(text: string, keyPrefix: string): ReactNode[] {
  const lines = text.split('\n');
  const result: ReactNode[] = [];

  lines.forEach((line, index) => {
    if (index > 0) {
      result.push(<br key={`${keyPrefix}-br-${index}`} />);
    }
    result.push(...renderInlineMarkdown(line, `${keyPrefix}-line-${index}`));
  });

  return result;
}

function ResourceLabelStrip({ resources }: { resources: ResourceLabel[] }) {
  if (resources.length === 0) {
    return null;
  }

  return (
    <div className={styles.resourceLabelList}>
      {resources.map((resource, index) => (
        <ResourceChip key={`${resource.kind}:${resource.name}:${resource.sourcePath ?? index}`} resource={resource} />
      ))}
    </div>
  );
}

function MarkdownContent({ body }: { body: string }) {
  const blocks = useMemo(() => parseMarkdownBlocks(body), [body]);
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);
  const copyCodeToClipboard = useCallback((code: string, key: string) => {
    void navigator.clipboard.writeText(code).then(() => {
      setCopiedCodeKey(key);
      setTimeout(() => setCopiedCodeKey((prev) => (prev === key ? null : prev)), 2000);
    });
  }, []);

  return (
    <div className={styles.markdownRoot}>
      {blocks.map((block, index) => {
        const key = `md-${index}`;

        if (block.type === 'heading') {
          if (block.level === 1) {
            return <h1 key={key} className={styles.markdownHeading}>{renderInlineWithBreaks(block.text, key)}</h1>;
          }
          if (block.level === 2) {
            return <h2 key={key} className={styles.markdownHeading}>{renderInlineWithBreaks(block.text, key)}</h2>;
          }
          if (block.level === 3) {
            return <h3 key={key} className={styles.markdownHeading}>{renderInlineWithBreaks(block.text, key)}</h3>;
          }
          return <h4 key={key} className={styles.markdownHeading}>{renderInlineWithBreaks(block.text, key)}</h4>;
        }

        if (block.type === 'paragraph') {
          return (
            <p key={key} className={styles.markdownParagraph}>
              {renderInlineWithBreaks(block.text, key)}
            </p>
          );
        }

        if (block.type === 'ul') {
          return (
            <ul key={key} className={styles.markdownList}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-li-${itemIndex}`} className={styles.markdownListItem}>
                  {renderInlineWithBreaks(item, `${key}-li-${itemIndex}`)}
                </li>
              ))}
            </ul>
          );
        }

        if (block.type === 'ol') {
          return (
            <ol key={key} className={styles.markdownOrderedList} start={block.start}>
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-oi-${itemIndex}`} className={styles.markdownListItem}>
                  {renderInlineWithBreaks(item, `${key}-oi-${itemIndex}`)}
                </li>
              ))}
            </ol>
          );
        }

        if (block.type === 'quote') {
          return (
            <blockquote key={key} className={styles.markdownQuote}>
              {renderInlineWithBreaks(block.text, key)}
            </blockquote>
          );
        }

        if (block.type === 'table') {
          return (
            <div key={key} className={styles.markdownTableWrap}>
              <table className={styles.markdownTable}>
                <thead>
                  <tr>
                    {block.headers.map((header, headerIndex) => (
                      <th
                        key={`${key}-th-${headerIndex}`}
                        style={block.alignments[headerIndex] ? { textAlign: block.alignments[headerIndex] } : undefined}
                      >
                        {renderInlineWithBreaks(header, `${key}-th-${headerIndex}`)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {block.rows.map((row, rowIndex) => (
                    <tr key={`${key}-tr-${rowIndex}`}>
                      {row.map((cell, cellIndex) => (
                        <td
                          key={`${key}-td-${rowIndex}-${cellIndex}`}
                          style={block.alignments[cellIndex] ? { textAlign: block.alignments[cellIndex] } : undefined}
                        >
                          {renderInlineWithBreaks(cell, `${key}-td-${rowIndex}-${cellIndex}`)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        <div key={key} className={styles.markdownCodeBlock}>
          <div className={styles.markdownCodeHeader}>
            {block.language && <span className={styles.markdownCodeLang}>{block.language}</span>}
            <button
              type="button"
              className={styles.copyCodeBtn}
              onClick={() => copyCodeToClipboard(block.code, key)}
              aria-label="코드 복사"
            >
              {copiedCodeKey === key ? '✓ 복사됨' : '복사'}
            </button>
          </div>
          <SyntaxHighlighter
            language={block.language?.toLowerCase() || 'text'}
            customStyle={{
              margin: 0,
              padding: '0.4rem 0.56rem 0.56rem',
              background: 'transparent',
              fontSize: '0.76rem',
              lineHeight: 1.45,
            }}
            wrapLongLines={false}
            PreTag="div"
          >
            {block.code}
          </SyntaxHighlighter>
        </div>
      })}
    </div>
  );
}

function TextReply({ body, isUser }: { body: string; isUser: boolean }) {
  const normalized = body.trim();
  if (!normalized) {
    return null;
  }

  return (
    <div className={isUser ? styles.userText : styles.agentText}>
      <MarkdownContent body={normalized} />
    </div>
  );
}

function ActionResultDetail({ event }: { event: UiEvent }) {
  const result = event.result ?? fallbackResult(event);
  if (!result?.preview) {
    return null;
  }

  const fullText = result.full ?? result.preview;

  return (
    <pre className={styles.actionResult}>{fullText}</pre>
  );
}

function diffLineToneClass(line: string): string {
  if (line.startsWith('+') && !line.startsWith('+++')) {
    return styles.diffLineAdd;
  }
  if (line.startsWith('-') && !line.startsWith('---')) {
    return styles.diffLineDel;
  }
  if (line.startsWith('@@ ')) {
    return styles.diffLineContext;
  }
  if (
    line.startsWith('diff --git ')
    || line.startsWith('+++ ')
    || line.startsWith('--- ')
    || line.startsWith('*** ')
  ) {
    return styles.diffLineMeta;
  }
  return styles.diffLineContext;
}

function renderDiffLineContent(
  line: string,
  hunk?: { file: string; line: number; additions: number; deletions: number },
): ReactNode {
  if (!line.startsWith('@@ ')) {
    return line.length > 0 ? line : ' ';
  }
  if (hunk) {
    return (
      <>
        <span className={`${styles.fileBadgeBase} ${styles.diffHunkFileBadge}`}>{hunk.file || '(unknown)'}</span>
        {' | '}
        line {hunk.line}
        {' | '}
        <span className={styles.diffHunkPlus}>+{hunk.additions}</span>
        {' '}
        <span className={styles.diffHunkMinus}>-{hunk.deletions}</span>
      </>
    );
  }
  const match = line.match(/^@@\s+-(\d+(?:,\d+)?)\s+\+(\d+(?:,\d+)?)\s+@@(.*)$/);
  if (!match) {
    return line;
  }
  const [, oldRange, newRange, tail] = match;
  return (
    <>
      {'@@ '}
      <span className={styles.diffHunkMinus}>-{oldRange}</span>
      {' '}
      <span className={styles.diffHunkPlus}>+{newRange}</span>
      {' @@'}
      {tail}
    </>
  );
}

function DiffCodeBlock({
  text,
  className,
  hunks = [],
}: {
  text: string;
  className: string;
  hunks?: Array<{ file: string; line: number; additions: number; deletions: number }>;
}) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  let hunkCursor = 0;
  return (
    <pre className={className}>
      {lines.map((line, index) => {
        const hunk = line.startsWith('@@ ') ? hunks[hunkCursor++] : undefined;
        return (
          <span key={`${index}-${line.length}`} className={`${styles.diffLine} ${diffLineToneClass(line)}`}>
            {renderDiffLineContent(line, hunk)}
          </span>
        );
      })}
    </pre>
  );
}

function CodeChangesEventCard({
  event,
  expanded,
  onToggle,
}: {
  event: UiEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  const summary = parseCodeChangeSummary(event);
  const compactPrimary = truncateSingleLine(resolveActionPrimary(event), 78);
  const previewText = summary.previewLines.join('\n');
  const fullPrimary = resolveActionPrimary(event).replace(/\s+/g, ' ').trim();
  const resourceLabels = extractResourceLabelsFromEvent(event);
  const hasResource = resourceLabels.length > 0;

  if (!expanded) {
    return (
      <div className={styles.codeChangesCompact}>
        <div className={styles.codeChangesCompactMain}>
          <div className={styles.actionCompactTopRow}>
            <span className={`${styles.kindChip} ${getToneClass('emerald')}`}>CHANGES</span>
            <span className={styles.actionFileLabelSeparator}>-</span>
            {hasResource ? (
              <ResourceLabelStrip resources={resourceLabels} />
            ) : (
              <span className={styles.actionCompactPrimaryInline}>{compactPrimary}</span>
            )}
          </div>
          {hasResource && (
            <div className={styles.actionPrimaryRow}>
              <span className={styles.actionCompactPrimary}>{compactPrimary}</span>
            </div>
          )}
          <div className={styles.codeChangesSummary}>
            <span>{summary.files.length} files</span>
            <span className={styles.codeChangesAdd}>+{summary.additions}</span>
            <span className={styles.codeChangesDel}>-{summary.deletions}</span>
          </div>
          {previewText && (
            <DiffCodeBlock text={previewText} className={styles.codeChangesPreview} hunks={summary.hunks} />
          )}
        </div>
        <button
          type="button"
          className={styles.actionExpandButton}
          onClick={onToggle}
          aria-expanded={false}
          aria-controls={`changes-${event.id}`}
          title="변경사항 펼치기"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.actionCard}>
      <div className={styles.actionHeader}>
        <div className={styles.actionHeaderMain}>
          <div className={styles.actionCompactTopRow}>
            <span className={`${styles.kindChip} ${getToneClass('emerald')}`}>CHANGES</span>
            <span className={styles.actionFileLabelSeparator}>-</span>
            {hasResource ? (
              <ResourceLabelStrip resources={resourceLabels} />
            ) : (
              <span className={styles.actionCompactPrimaryInline}>{fullPrimary}</span>
            )}
          </div>
          {hasResource && (
            <div className={styles.actionPrimaryRow}>
              <span className={styles.actionPrimary}>{fullPrimary}</span>
            </div>
          )}
          <div className={styles.codeChangesSummary}>
            <span>{summary.files.length} files</span>
            <span className={styles.codeChangesAdd}>+{summary.additions}</span>
            <span className={styles.codeChangesDel}>-{summary.deletions}</span>
          </div>
          {summary.files.length > 0 && (
            <div className={styles.codeChangesFiles}>
              {summary.files.slice(0, 3).map((file) => (
                <span key={file} className={`${styles.fileBadgeBase} ${styles.codeChangesFile}`}>{fileNameOnly(file)}</span>
              ))}
              {summary.files.length > 3 && <span className={`${styles.fileBadgeBase} ${styles.codeChangesFile}`}>+{summary.files.length - 3} more</span>}
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.actionExpandButton}
          onClick={onToggle}
          aria-expanded
          aria-controls={`changes-${event.id}`}
          title="변경사항 접기"
        >
          <ChevronDown size={15} />
        </button>
      </div>
      <div id={`changes-${event.id}`} className={styles.actionResultWrap}>
        <DiffCodeBlock text={summary.fullText || '(no diff output)'} className={styles.codeChangesFull} hunks={summary.hunks} />
      </div>
    </div>
  );
}

function ActionEventCard({
  event,
  expanded,
  onToggle,
}: {
  event: UiEvent;
  expanded: boolean;
  onToggle: () => void;
}) {
  if (!isActionKind(event.kind)) {
    return <TextReply body={event.body || event.title} isUser={false} />;
  }

  const kindMeta = getEventKindMeta(event.kind);
  const KindIcon = kindMeta.Icon;
  const fullPrimary = resolveActionPrimary(event).replace(/\s+/g, ' ').trim();
  const compactPrimary = truncateSingleLine(fullPrimary, 88);
  const resourceLabels = extractResourceLabelsFromEvent(event);

  const hasResource = resourceLabels.length > 0;

  if (!expanded) {
    return (
      <div className={styles.actionCompact}>
        <div className={styles.actionCompactMain}>
          <div className={styles.actionCompactTopRow}>
            <span className={`${styles.kindChip} ${getToneClass(kindMeta.tone)}`}>
              <KindIcon size={12} />
              {kindMeta.label}
            </span>
            <span className={styles.actionFileLabelSeparator}>-</span>
            {hasResource ? (
              <ResourceLabelStrip resources={resourceLabels} />
            ) : (
              <span className={styles.actionCompactPrimaryInline}>{compactPrimary}</span>
            )}
          </div>
          {hasResource && (
            <div className={styles.actionPrimaryRow}>
              <span className={styles.actionCompactPrimary}>{compactPrimary}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.actionExpandButton}
          onClick={onToggle}
          aria-expanded={false}
          aria-controls={`result-${event.id}`}
          title="행동 상세 펼치기"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    );
  }

  return (
    <div className={styles.actionCard}>
      <div className={styles.actionHeader}>
        <div className={styles.actionHeaderMain}>
          <div className={styles.actionCompactTopRow}>
            <span className={`${styles.kindChip} ${getToneClass(kindMeta.tone)}`}>
              <KindIcon size={13} />
              {kindMeta.label}
            </span>
            <span className={styles.actionFileLabelSeparator}>-</span>
            {hasResource ? (
              <ResourceLabelStrip resources={resourceLabels} />
            ) : (
              <span className={styles.actionCompactPrimaryInline}>{fullPrimary}</span>
            )}
          </div>
          {hasResource && (
            <div className={styles.actionPrimaryRow}>
              <span className={styles.actionPrimary}>{fullPrimary}</span>
            </div>
          )}
        </div>
        <button
          type="button"
          className={styles.actionExpandButton}
          onClick={onToggle}
          aria-expanded
          aria-controls={`result-${event.id}`}
          title="행동 상세 접기"
        >
          <ChevronDown size={15} />
        </button>
      </div>
      <div id={`result-${event.id}`} className={styles.actionResultWrap}>
        <ActionResultDetail event={event} />
      </div>
    </div>
  );
}

function renderEventPayload(
  event: UiEvent,
  userEvent: boolean,
  expanded: boolean,
  onToggleExpand: () => void,
) {
  if (userEvent) {
    return <TextReply body={event.body || event.title} isUser />;
  }

  if (isActionKind(event.kind)) {
    if (event.kind === 'file_write') {
      const summary = parseCodeChangeSummary(event);
      if (summary.hasDiffSignal) {
        return <CodeChangesEventCard event={event} expanded={expanded} onToggle={onToggleExpand} />;
      }
      return <ActionEventCard event={event} expanded={expanded} onToggle={onToggleExpand} />;
    }
    return <ActionEventCard event={event} expanded={expanded} onToggle={onToggleExpand} />;
  }

  return <TextReply body={event.body || event.title} isUser={false} />;
}

export function ChatInterface({
  sessionId,
  initialEvents,
  initialHasMoreBefore,
  initialPermissions,
  initialChats,
  activeChatId,
  isOperator,
  projectName,
  alias,
  agentFlavor,
  approvalPolicy,
}: {
  sessionId: string;
  initialEvents: UiEvent[];
  initialHasMoreBefore: boolean;
  initialPermissions: PermissionRequest[];
  initialChats: SessionChat[];
  activeChatId: string | null;
  isOperator: boolean;
  projectName: string;
  alias?: string | null;
  agentFlavor: string;
  approvalPolicy?: ApprovalPolicy;
}) {
  const router = useRouter();
  const [chats, setChats] = useState<SessionChat[]>(() => sortSessionChats(initialChats));
  const [selectedChatId, setSelectedChatId] = useState<string | null>(activeChatId);
  const activeChat = useMemo(
    () => (selectedChatId ? chats.find((chat) => chat.id === selectedChatId) : null) ?? chats[0] ?? null,
    [chats, selectedChatId],
  );
  const activeChatIdResolved = activeChat?.id ?? null;
  const includeUnassignedEvents = Boolean(activeChat?.isDefault);
  const sessionTitle = alias || projectName;
  const currentChatTitle = activeChat?.title || '새 채팅';
  const displayName = activeChat?.title || alias || projectName;
  const {
    events,
    addEvent,
    syncError,
    loadOlder,
    hasMoreBefore,
    isLoadingOlder,
  } = useSessionEvents(
    sessionId,
    activeChatIdResolved,
    includeUnassignedEvents,
    initialEvents,
    initialHasMoreBefore,
    activeChatId,
  );
  const { isRunning: runtimeRunning, runtimeError } = useSessionRuntime(sessionId, activeChatIdResolved);
  const {
    displayPermissions,
    pendingPermissions,
    loadingPermissionId,
    decidePermission,
    error: permissionError,
  } = usePermissions(sessionId, initialPermissions);

  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [isAborting, setIsAborting] = useState(false);
  const [awaitingReplySince, setAwaitingReplySince] = useState<string | null>(null);
  const [showDisconnectRetry, setShowDisconnectRetry] = useState(false);
  const [lastSubmittedPayload, setLastSubmittedPayload] = useState<{
    text: string;
    chatId: string;
    agent: AgentFlavor;
    threadId?: string;
  } | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [expandedResultIds, setExpandedResultIds] = useState<Record<string, boolean>>({});
  const [expandedActionRunIds, setExpandedActionRunIds] = useState<Record<string, boolean>>({});
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [chatTrackingCopyState, setChatTrackingCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');
  const [showPermissionQueue, setShowPermissionQueue] = useState(true);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const [isChatSidebarOpen, setIsChatSidebarOpen] = useState(true);
  const [chatVisibleCount, setChatVisibleCount] = useState(SIDEBAR_CHAT_PAGE_SIZE);
  const [chatActionMenuId, setChatActionMenuId] = useState<string | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [chatTitleDraft, setChatTitleDraft] = useState('');
  const [chatMutationLoadingId, setChatMutationLoadingId] = useState<string | null>(null);
  const [chatMutationError, setChatMutationError] = useState<string | null>(null);
  const [chatSidebarSnapshots, setChatSidebarSnapshots] = useState<Record<string, ChatSidebarSnapshot>>({});
  const [approvalFeedbackByChat, setApprovalFeedbackByChat] = useState<Record<string, ChatApprovalFeedback>>({});
  const [sidebarApprovalLoadingChatId, setSidebarApprovalLoadingChatId] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);
  const [isCreateChatMenuOpen, setIsCreateChatMenuOpen] = useState(false);
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [plusMenuMode, setPlusMenuMode] = useState<'closed' | 'menu' | 'file' | 'text'>('closed');
  const [textContextInput, setTextContextInput] = useState('');
  const [selectedModelId, setSelectedModelId] = useState<ComposerModelId>('claude-sonnet-4-6');
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const [fileBrowserPath, setFileBrowserPath] = useState('/');
  const [fileBrowserItems, setFileBrowserItems] = useState<Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }>>([]);
  const [fileBrowserParentPath, setFileBrowserParentPath] = useState<string | null>(null);
  const [fileBrowserLoading, setFileBrowserLoading] = useState(false);
  const [fileBrowserError, setFileBrowserError] = useState<string | null>(null);
  const [fileBrowserQuery, setFileBrowserQuery] = useState('');
  const [fileBrowserSearchResults, setFileBrowserSearchResults] = useState<Array<{ name: string; path: string; isDirectory: boolean }> | null>(null);
  const [fileBrowserSearchLoading, setFileBrowserSearchLoading] = useState(false);
  const [recentAttachments, setRecentAttachments] = useState<string[]>([]);
  const [isMounted, setIsMounted] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const createChatMenuRef = useRef<HTMLDivElement>(null);
  const chatSidebarRef = useRef<HTMLDivElement>(null);
  const chatShellRef = useRef<HTMLDivElement>(null);
  const centerPanelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const shouldStickToBottomRef = useRef(true);
  const disconnectNoticeAwaitingRef = useRef<string | null>(null);
  const runtimeStartedSinceAwaitingRef = useRef(false);
  const approvalFeedbackTimersRef = useRef<Record<string, number>>({});
  const chatSidebarFetchInFlightRef = useRef<Record<string, boolean>>({});

  const defaultAgentFlavor = normalizeAgentFlavor(agentFlavor, 'codex');
  const activeAgentFlavor = normalizeAgentFlavor(activeChat?.agent, defaultAgentFlavor);
  const agentMeta = resolveAgentMeta(activeAgentFlavor);
  const runtimeNotice = submitError ?? permissionError ?? syncError ?? runtimeError ?? null;
  const isRunActive = isSubmitting || runtimeRunning || isAborting;
  const isAgentRunning = isRunActive || isAwaitingReply;
  const connectionState: 'running' | 'connected' | 'degraded' = isAgentRunning
    ? 'running'
    : runtimeNotice
      ? 'degraded'
      : 'connected';
  const connectionLabel = connectionState === 'running'
    ? '실행 중'
    : connectionState === 'connected'
      ? '정상 연결'
      : '응답 지연 또는 연결 확인 필요';

  const recentEvents = useMemo(() => [...events].slice(-10).reverse(), [events]);
  const recentUserEvents = useMemo(
    () => events.filter((event) => isUserEvent(event)).slice(-SIDEBAR_RECENTS_LIMIT).reverse(),
    [events]
  );
  const agentReplies = useMemo(() => events.filter((event) => !isUserEvent(event)).length, [events]);
  const streamItems = useMemo(() => buildStreamRenderItems(events, expandedActionRunIds), [events, expandedActionRunIds]);
  const timelineItems = useMemo<TimelineRenderItem[]>(() => {
    const merged: TimelineRenderItem[] = [];
    let order = 0;
    const fallbackBase = Number.MAX_SAFE_INTEGER / 8;

    for (const item of streamItems) {
      const timestamp = item.type === 'event' ? item.event.timestamp : item.timestamp;
      const parsed = Date.parse(timestamp);
      merged.push({
        type: 'stream',
        item,
        sortKey: Number.isFinite(parsed) ? parsed : fallbackBase + order,
        order,
      });
      order += 1;
    }

    if (showPermissionQueue) {
      for (const permission of displayPermissions) {
        const parsed = Date.parse(permission.requestedAt);
        merged.push({
          type: 'permission',
          permission,
          sortKey: Number.isFinite(parsed) ? parsed : fallbackBase + order,
          order,
        });
        order += 1;
      }
    }

    return merged.sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        return a.sortKey - b.sortKey;
      }
      return a.order - b.order;
    });
  }, [displayPermissions, showPermissionQueue, streamItems]);
  const firstPendingPermissionId = pendingPermissions[0]?.id ?? null;
  const visibleChats = useMemo(() => chats.slice(0, chatVisibleCount), [chats, chatVisibleCount]);
  const hasMoreChats = chats.length > chatVisibleCount;

  const upsertChatSidebarSnapshot = useCallback((chatId: string, patch: Partial<ChatSidebarSnapshot>) => {
    setChatSidebarSnapshots((prev) => {
      const current = prev[chatId] ?? {
        preview: '',
        hasEvents: false,
        hasErrorSignal: false,
      };
      const next: ChatSidebarSnapshot = {
        ...current,
        ...patch,
      };
      if (
        current.preview === next.preview
        && current.hasEvents === next.hasEvents
        && current.hasErrorSignal === next.hasErrorSignal
      ) {
        return prev;
      }
      return {
        ...prev,
        [chatId]: next,
      };
    });
  }, []);

  const scheduleApprovalFeedbackReset = useCallback((chatId: string) => {
    const currentTimer = approvalFeedbackTimersRef.current[chatId];
    if (currentTimer) {
      window.clearTimeout(currentTimer);
    }
    approvalFeedbackTimersRef.current[chatId] = window.setTimeout(() => {
      setApprovalFeedbackByChat((prev) => {
        if (!prev[chatId]) {
          return prev;
        }
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      delete approvalFeedbackTimersRef.current[chatId];
    }, SIDEBAR_APPROVAL_FEEDBACK_MS);
  }, []);

  const resolveChatSidebarState = useCallback((chat: SessionChat): ChatSidebarState => {
    const isActive = chat.id === activeChatIdResolved;
    const snapshot = chatSidebarSnapshots[chat.id];
    const hasFeedback = Boolean(approvalFeedbackByChat[chat.id]);
    const hasPendingApproval = isActive && pendingPermissions.length > 0;

    if (hasPendingApproval && !hasFeedback) {
      return 'approval';
    }
    if (
      isActive
      && (
        Boolean(runtimeNotice)
        || showDisconnectRetry
        || Boolean(snapshot?.hasErrorSignal)
      )
    ) {
      return 'error';
    }
    if (isActive && (isAgentRunning || hasFeedback)) {
      return 'running';
    }
    if (snapshot?.hasErrorSignal) {
      return 'error';
    }
    if (snapshot?.hasEvents || Boolean(snapshot?.preview)) {
      return 'completed';
    }
    return 'default';
  }, [
    activeChatIdResolved,
    approvalFeedbackByChat,
    chatSidebarSnapshots,
    isAgentRunning,
    pendingPermissions.length,
    runtimeNotice,
    showDisconnectRetry,
  ]);

  const resolveChatPreviewText = useCallback((chatId: string): string => {
    const preview = chatSidebarSnapshots[chatId]?.preview?.trim();
    if (preview) {
      return preview;
    }
    return '최근 메시지가 없습니다.';
  }, [chatSidebarSnapshots]);

  const handleSidebarPermissionDecision = useCallback(async (
    chatId: string,
    decision: 'allow_once' | 'allow_session' | 'deny',
  ) => {
    if (!isOperator) {
      return;
    }
    const targetPermission = pendingPermissions[0];
    if (!targetPermission) {
      return;
    }

    setSidebarApprovalLoadingChatId(chatId);
    setChatMutationError(null);
    const result = await decidePermission(targetPermission.id, decision);
    setSidebarApprovalLoadingChatId(null);

    if (!result.success) {
      setChatMutationError(result.error ?? '승인 요청 처리에 실패했습니다.');
      return;
    }

    setApprovalFeedbackByChat((prev) => ({
      ...prev,
      [chatId]: decision === 'deny' ? 'denied' : 'approved',
    }));
    scheduleApprovalFeedbackReset(chatId);
  }, [decidePermission, isOperator, pendingPermissions, scheduleApprovalFeedbackReset]);

  const handleLoadMoreChats = useCallback(() => {
    setChatVisibleCount((prev) => Math.min(prev + SIDEBAR_CHAT_PAGE_SIZE, chats.length));
  }, [chats.length]);

  useEffect(() => { setIsMounted(true); }, []);

  useEffect(() => {
    setChats(sortSessionChats(initialChats));
    setChatActionMenuId(null);
    setRenamingChatId(null);
    setChatTitleDraft('');
    setChatMutationError(null);
  }, [initialChats, activeChatId]);

  useEffect(() => {
    setSelectedChatId(activeChatId);
  }, [sessionId, activeChatId]);

  useEffect(() => {
    setIsSubmitting(false);
    setIsAborting(false);
    setIsAwaitingReply(false);
    setAwaitingReplySince(null);
    setShowDisconnectRetry(false);
    setSubmitError(null);
    setSidebarApprovalLoadingChatId(null);
    disconnectNoticeAwaitingRef.current = null;
    runtimeStartedSinceAwaitingRef.current = false;
  }, [activeChatIdResolved]);

  useEffect(() => {
    setChatVisibleCount((prev) => {
      const nextMax = Math.max(SIDEBAR_CHAT_PAGE_SIZE, chats.length);
      return Math.min(prev, nextMax);
    });
  }, [chats.length]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(approvalFeedbackTimersRef.current)) {
        window.clearTimeout(timerId);
      }
      approvalFeedbackTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const chatIds = new Set(chats.map((chat) => chat.id));
    setChatSidebarSnapshots((prev) => {
      const nextEntries = Object.entries(prev).filter(([chatId]) => chatIds.has(chatId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries);
    });
    setApprovalFeedbackByChat((prev) => {
      const next: Record<string, ChatApprovalFeedback> = {};
      for (const [chatId, state] of Object.entries(prev)) {
        if (!chatIds.has(chatId)) {
          const timerId = approvalFeedbackTimersRef.current[chatId];
          if (timerId) {
            window.clearTimeout(timerId);
            delete approvalFeedbackTimersRef.current[chatId];
          }
          continue;
        }
        next[chatId] = state;
      }
      if (Object.keys(next).length === Object.keys(prev).length) {
        return prev;
      }
      return next;
    });

    const nextInFlight: Record<string, boolean> = {};
    for (const [chatId, value] of Object.entries(chatSidebarFetchInFlightRef.current)) {
      if (chatIds.has(chatId)) {
        nextInFlight[chatId] = value;
      }
    }
    chatSidebarFetchInFlightRef.current = nextInFlight;
  }, [chats]);

  useEffect(() => {
    if (!activeChatIdResolved) {
      return;
    }
    const latestEvent = events[events.length - 1];
    upsertChatSidebarSnapshot(activeChatIdResolved, {
      preview: latestEvent ? resolveRecentSummary(latestEvent) : '',
      hasEvents: events.length > 0,
      hasErrorSignal: Boolean(runtimeNotice) || showDisconnectRetry || hasChatErrorSignal(latestEvent),
    });
  }, [
    activeChatIdResolved,
    events,
    runtimeNotice,
    showDisconnectRetry,
    upsertChatSidebarSnapshot,
  ]);

  useEffect(() => {
    let cancelled = false;
    const targets = visibleChats.filter((chat) => (
      !chatSidebarSnapshots[chat.id]
      && !chatSidebarFetchInFlightRef.current[chat.id]
    ));
    if (targets.length === 0) {
      return;
    }

    for (const chat of targets) {
      chatSidebarFetchInFlightRef.current[chat.id] = true;
    }

    void Promise.all(targets.map(async (chat) => {
      try {
        const params = new URLSearchParams({
          limit: '1',
          chatId: chat.id,
        });
        if (chat.isDefault) {
          params.set('includeUnassigned', '1');
        }

        const response = await fetch(
          `/api/runtime/sessions/${encodeURIComponent(sessionId)}/events?${params.toString()}`,
          { cache: 'no-store' },
        );

        if (!response.ok) {
          if (!cancelled) {
            upsertChatSidebarSnapshot(chat.id, { preview: '', hasEvents: false, hasErrorSignal: false });
          }
          return;
        }

        const payload = (await response.json().catch(() => ({}))) as { events?: UiEvent[] };
        const resolvedEvents = Array.isArray(payload.events) ? payload.events : [];
        const latestEvent = resolvedEvents[resolvedEvents.length - 1];
        if (!cancelled) {
          upsertChatSidebarSnapshot(chat.id, {
            preview: latestEvent ? resolveRecentSummary(latestEvent) : '',
            hasEvents: resolvedEvents.length > 0,
            hasErrorSignal: hasChatErrorSignal(latestEvent),
          });
        }
      } catch {
        if (!cancelled) {
          upsertChatSidebarSnapshot(chat.id, { preview: '', hasEvents: false, hasErrorSignal: false });
        }
      } finally {
        delete chatSidebarFetchInFlightRef.current[chat.id];
      }
    }));

    return () => {
      cancelled = true;
    };
  }, [chatSidebarSnapshots, sessionId, upsertChatSidebarSnapshot, visibleChats]);

  useEffect(() => {
    if (plusMenuMode === 'closed' && !isModelDropdownOpen && !isCreateChatMenuOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setPlusMenuMode('closed');
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
      if (createChatMenuRef.current && !createChatMenuRef.current.contains(e.target as Node)) {
        setIsCreateChatMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [plusMenuMode, isModelDropdownOpen, isCreateChatMenuOpen]);

  const removeContextItem = useCallback((id: string) => {
    setContextItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const handleAddTextContext = useCallback(() => {
    const text = textContextInput.trim();
    if (!text) return;
    setContextItems((prev) => [...prev, { id: genId(), type: 'text', text }]);
    setTextContextInput('');
    setPlusMenuMode('closed');
  }, [textContextInput]);

  const fetchFileBrowserDir = useCallback(async (dirPath: string) => {
    setFileBrowserLoading(true);
    setFileBrowserError(null);
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(dirPath)}`);
      const data = (await res.json().catch(() => ({}))) as {
        directories?: Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }>;
        parentPath?: string | null;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? '디렉토리를 읽을 수 없습니다.');
      setFileBrowserPath(dirPath);
      setFileBrowserItems(data.directories ?? []);
      setFileBrowserParentPath(data.parentPath ?? null);
    } catch (err) {
      setFileBrowserError(err instanceof Error ? err.message : '디렉토리 읽기 실패');
    } finally {
      setFileBrowserLoading(false);
    }
  }, []);

  const handleFileBrowserOpen = useCallback(() => {
    setPlusMenuMode('file');
    setFileBrowserQuery('');
    setFileBrowserSearchResults(null);
    setRecentAttachments(getRecentFiles());
    void fetchFileBrowserDir('/');
  }, [fetchFileBrowserDir]);

  const handleFileBrowserSearch = useCallback(async (query: string) => {
    setFileBrowserQuery(query);
    if (!query.trim()) {
      setFileBrowserSearchResults(null);
      return;
    }
    setFileBrowserSearchLoading(true);
    try {
      const res = await fetch(`/api/fs/search?q=${encodeURIComponent(query.trim())}`);
      const data = (await res.json().catch(() => ({}))) as {
        results?: Array<{ name: string; path: string; isDirectory: boolean }>;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? '검색 실패');
      setFileBrowserSearchResults(data.results ?? []);
    } catch {
      setFileBrowserSearchResults([]);
    } finally {
      setFileBrowserSearchLoading(false);
    }
  }, []);

  const handleFileBrowserSelect = useCallback(async (filePath: string) => {
    setFileBrowserLoading(true);
    setFileBrowserError(null);
    try {
      const res = await fetch(`/api/fs/read?path=${encodeURIComponent(filePath)}`);
      const data = (await res.json().catch(() => ({}))) as { content?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? '파일을 읽을 수 없습니다.');
      const name = filePath.split('/').filter(Boolean).pop() ?? filePath;
      setContextItems((prev) => [...prev, { id: genId(), type: 'file', path: filePath, content: data.content ?? '', name }]);
      saveRecentFile(filePath);
      setPlusMenuMode('closed');
    } catch (err) {
      setFileBrowserError(err instanceof Error ? err.message : '파일 읽기 실패');
    } finally {
      setFileBrowserLoading(false);
    }
  }, []);

  const markSessionAsRead = useCallback(async () => {
    try {
      await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastReadAt: new Date().toISOString() }),
      });
    } catch {
      // Best-effort cursor sync.
    }
  }, [sessionId]);

  useEffect(() => {
    setExpandedResultIds({});
    setExpandedActionRunIds({});
  }, [sessionId]);

  useEffect(() => {
    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    const timer = window.setTimeout(() => {
      void markSessionAsRead();
    }, READ_CURSOR_SYNC_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sessionId, events.length, pendingPermissions.length, markSessionAsRead]);

  useEffect(() => {
    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void markSessionAsRead();
      }
    };

    document.addEventListener('visibilitychange', syncWhenVisible);
    window.addEventListener('focus', syncWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', syncWhenVisible);
      window.removeEventListener('focus', syncWhenVisible);
    };
  }, [markSessionAsRead]);

  useEffect(() => {
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_LAYOUT_MAX_WIDTH_PX}px)`);

    const syncLayout = () => {
      const nextIsMobile = mediaQuery.matches;
      setIsMobileLayout(nextIsMobile);
      setIsChatSidebarOpen(!nextIsMobile);
    };

    syncLayout();
    if (typeof mediaQuery.addEventListener === 'function') {
      mediaQuery.addEventListener('change', syncLayout);
    } else {
      mediaQuery.addListener(syncLayout);
    }

    return () => {
      if (typeof mediaQuery.removeEventListener === 'function') {
        mediaQuery.removeEventListener('change', syncLayout);
      } else {
        mediaQuery.removeListener(syncLayout);
      }
    };
  }, []);

  const toggleResult = useCallback((eventId: string) => {
    setExpandedResultIds((prev) => ({
      ...prev,
      [eventId]: !prev[eventId],
    }));
  }, []);

  const toggleActionRun = useCallback((runId: string) => {
    setExpandedActionRunIds((prev) => ({
      ...prev,
      [runId]: !prev[runId],
    }));
  }, []);

  const loadOlderHistory = useCallback(async () => {
    if (isLoadingOlder || !hasMoreBefore) {
      return;
    }

    if (isMobileLayout) {
      const previousDocHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      const previousTop = getWindowScrollTop();
      await loadOlder().catch(() => {
      });
      requestAnimationFrame(() => {
        const nextDocHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        const delta = Math.max(0, nextDocHeight - previousDocHeight);
        if (delta > 0) {
          window.scrollTo({ top: previousTop + delta, behavior: 'auto' });
        }
      });
      return;
    }

    const stream = scrollRef.current;
    if (!stream) {
      await loadOlder().catch(() => {
      });
      return;
    }

    const previousHeight = stream.scrollHeight;
    const previousTop = stream.scrollTop;
    await loadOlder().catch(() => {
    });

    requestAnimationFrame(() => {
      const nextStream = scrollRef.current;
      if (!nextStream) {
        return;
      }
      const delta = Math.max(0, nextStream.scrollHeight - previousHeight);
      nextStream.scrollTop = previousTop + delta;
    });
  }, [hasMoreBefore, isLoadingOlder, isMobileLayout, loadOlder]);

  const syncComposerDockMetrics = useCallback(() => {
    const shell = chatShellRef.current;
    const centerPanel = centerPanelRef.current;
    const dock = composerDockRef.current;
    if (!shell || !dock) {
      return;
    }

    const height = Math.ceil(dock.getBoundingClientRect().height);
    shell.style.setProperty('--composer-dock-height', `${height}px`);

    if (!centerPanel) {
      return;
    }

    const viewportWidth = window.innerWidth;
    const rect = centerPanel.getBoundingClientRect();
    const inset = viewportWidth <= 960 ? 10 : 12;
    const left = Math.max(inset, Math.round(rect.left) + inset);
    const maxWidth = Math.max(240, viewportWidth - inset * 2);
    const nextWidth = Math.max(240, Math.min(maxWidth, Math.round(rect.width) - inset * 2));
    shell.style.setProperty('--composer-dock-left', `${left}px`);
    shell.style.setProperty('--composer-dock-width', `${nextWidth}px`);
  }, []);

  const resizeComposerInput = useCallback(() => {
    const input = composerInputRef.current;
    if (!input) {
      return;
    }

    input.style.height = '0px';
    const nextHeight = Math.min(COMPOSER_MAX_HEIGHT_PX, Math.max(COMPOSER_MIN_HEIGHT_PX, input.scrollHeight));
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = nextHeight >= COMPOSER_MAX_HEIGHT_PX ? 'auto' : 'hidden';
    requestAnimationFrame(syncComposerDockMetrics);
  }, [syncComposerDockMetrics]);

  const scrollConversationToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    if (isMobileLayout) {
      const keyboardOpen = document.documentElement.dataset.keyboardOpen === 'true';
      if (keyboardOpen) {
        return;
      }

      const top = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
      window.scrollTo({ top, behavior });
      return;
    }

    const stream = scrollRef.current;
    if (!stream) {
      return;
    }
    stream.scrollTo({ top: stream.scrollHeight, behavior });
  }, [isMobileLayout]);

  const syncScrollToBottomButton = useCallback(() => {
    if (isMobileLayout) {
      setShowScrollToBottom(!isNearWindowBottom());
      return;
    }
    const stream = scrollRef.current;
    if (!stream) {
      setShowScrollToBottom(false);
      return;
    }
    setShowScrollToBottom(!isNearBottom(stream));
  }, [isMobileLayout]);

  const handleJumpToBottom = useCallback(() => {
    shouldStickToBottomRef.current = true;
    setShowScrollToBottom(false);
    scrollConversationToBottom('smooth');
  }, [scrollConversationToBottom]);

  const handleComposerFocus = useCallback(() => {
    if (isMobileLayout) {
      shouldStickToBottomRef.current = false;
      return;
    }

    shouldStickToBottomRef.current = true;
    requestAnimationFrame(() => {
      scrollConversationToBottom('auto');
    });
  }, [isMobileLayout, scrollConversationToBottom]);

  const jumpToPendingPermission = useCallback(() => {
    if (!firstPendingPermissionId) {
      return;
    }
    setShowPermissionQueue(true);
    requestAnimationFrame(() => {
      const target = document.getElementById(`permission-${firstPendingPermissionId}`);
      if (!target) {
        return;
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [firstPendingPermissionId]);

  const handleCopyChatTrackingIds = useCallback(async () => {
    try {
      if (!activeChatIdResolved) {
        throw new Error('missing-chat-id');
      }
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('clipboard-unavailable');
      }
      const payload = JSON.stringify({
        chatId: activeChatIdResolved,
        threadId: activeChat?.threadId ?? null,
      }, null, 2);
      await navigator.clipboard.writeText(payload);
      setChatTrackingCopyState('copied');
      window.setTimeout(() => {
        setChatTrackingCopyState((current) => (current === 'copied' ? 'idle' : current));
      }, 1800);
    } catch {
      setChatTrackingCopyState('failed');
      window.setTimeout(() => {
        setChatTrackingCopyState((current) => (current === 'failed' ? 'idle' : current));
      }, 2200);
    }
  }, [activeChatIdResolved, activeChat?.threadId]);

  const jumpToEvent = useCallback((eventId: string) => {
    const target = document.getElementById(`event-${eventId}`);
    if (!target) {
      return;
    }
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (highlightedEventId === eventId) {
      setHighlightedEventId(null);
      requestAnimationFrame(() => setHighlightedEventId(eventId));
      return;
    }
    setHighlightedEventId(eventId);
  }, [highlightedEventId]);

  useEffect(() => {
    if (!highlightedEventId) {
      return;
    }
    const timer = window.setTimeout(() => {
      setHighlightedEventId((current) => (current === highlightedEventId ? null : current));
    }, 2000);
    return () => {
      window.clearTimeout(timer);
    };
  }, [highlightedEventId]);

  useEffect(() => {
    if (!isContextMenuOpen) {
      setChatTrackingCopyState('idle');
    }
  }, [isContextMenuOpen]);

  useEffect(() => {
    if (!isContextMenuOpen) {
      return;
    }
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (contextMenuRef.current?.contains(target)) {
        return;
      }
      setIsContextMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [isContextMenuOpen]);

  useEffect(() => {
    if (!chatActionMenuId) {
      return;
    }
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (chatSidebarRef.current?.contains(target)) {
        return;
      }
      setChatActionMenuId(null);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [chatActionMenuId]);

  useEffect(() => {
    resizeComposerInput();
  }, [prompt, resizeComposerInput]);

  useEffect(() => {
    syncComposerDockMetrics();
    const handleResize = () => syncComposerDockMetrics();
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('scroll', handleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', handleResize);
    window.visualViewport?.addEventListener('scroll', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('scroll', handleResize);
    };
  }, [syncComposerDockMetrics]);

  useEffect(() => {
    if (!isMobileLayout) {
      shouldStickToBottomRef.current = true;
      syncScrollToBottomButton();
      return;
    }

    const updateStickState = () => {
      const nearBottom = isNearWindowBottom();
      shouldStickToBottomRef.current = nearBottom;
      setShowScrollToBottom(!nearBottom);
    };

    const rafId = window.requestAnimationFrame(updateStickState);
    window.addEventListener('scroll', updateStickState, { passive: true });
    window.visualViewport?.addEventListener('scroll', updateStickState, { passive: true } as EventListenerOptions);
    window.visualViewport?.addEventListener('resize', updateStickState, { passive: true } as EventListenerOptions);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('scroll', updateStickState);
      window.visualViewport?.removeEventListener('scroll', updateStickState);
      window.visualViewport?.removeEventListener('resize', updateStickState);
    };
  }, [isMobileLayout, syncScrollToBottomButton]);

  useEffect(() => {
    if (!isMobileLayout) {
      return;
    }

    const onWindowScroll = () => {
      if (isLoadingOlder || !hasMoreBefore) {
        return;
      }
      if (getWindowScrollTop() <= 96) {
        void loadOlderHistory();
      }
    };

    window.addEventListener('scroll', onWindowScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onWindowScroll);
    };
  }, [isMobileLayout, isLoadingOlder, hasMoreBefore, loadOlderHistory]);

  useEffect(() => {
    syncScrollToBottomButton();
  }, [events.length, pendingPermissions.length, showPermissionQueue, syncScrollToBottomButton]);

  useEffect(() => {
    if (!shouldStickToBottomRef.current) {
      return;
    }
    scrollConversationToBottom('auto');

    const rafId = window.requestAnimationFrame(() => {
      if (shouldStickToBottomRef.current) {
        scrollConversationToBottom('auto');
      }
    });
    const timeoutId = window.setTimeout(() => {
      if (shouldStickToBottomRef.current) {
        scrollConversationToBottom('auto');
      }
    }, 140);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [events, isAwaitingReply, pendingPermissions.length, scrollConversationToBottom]);

  const hasAgentEventSince = useCallback((since: string | null): boolean => {
    if (!since) {
      return false;
    }
    const sinceEpoch = Date.parse(since);
    return events.some((event) => {
      if (isUserEvent(event)) {
        return false;
      }

      const eventEpoch = Date.parse(event.timestamp);
      if (!Number.isFinite(sinceEpoch) || !Number.isFinite(eventEpoch)) {
        return true;
      }
      return eventEpoch >= sinceEpoch;
    });
  }, [events]);

  useEffect(() => {
    if (!isAwaitingReply) {
      return;
    }
    if (runtimeRunning) {
      runtimeStartedSinceAwaitingRef.current = true;
    }
  }, [isAwaitingReply, runtimeRunning]);

  useEffect(() => {
    if (!awaitingReplySince) {
      return;
    }
    const hasAnyAgentEvent = hasAgentEventSince(awaitingReplySince);

    if (!isRunActive && hasAnyAgentEvent) {
      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      setSubmitError(null);
      setShowDisconnectRetry(false);
      disconnectNoticeAwaitingRef.current = null;
      runtimeStartedSinceAwaitingRef.current = false;
    }
  }, [awaitingReplySince, hasAgentEventSince, isRunActive]);

  useEffect(() => {
    if (!isAwaitingReply || !awaitingReplySince || isRunActive) {
      return;
    }
    if (!runtimeStartedSinceAwaitingRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (disconnectNoticeAwaitingRef.current === awaitingReplySince) {
        return;
      }
      if (hasAgentEventSince(awaitingReplySince)) {
        return;
      }

      const now = new Date().toISOString();
      disconnectNoticeAwaitingRef.current = awaitingReplySince;
      setShowDisconnectRetry(true);
      setSubmitError('에이전트 연결 중단됨');
      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      runtimeStartedSinceAwaitingRef.current = false;
      addEvent({
        id: `runtime-disconnected-${now}`,
        timestamp: now,
        kind: 'unknown',
        title: 'Runtime Notice',
        body: '에이전트 연결이 중단되었습니다. 아래 버튼으로 다시 시도할 수 있습니다.',
        meta: {
          role: 'agent',
          system: true,
          streamEvent: 'runtime_disconnected',
        },
        severity: 'warning',
      });
    }, RUNTIME_DISCONNECT_GRACE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [addEvent, awaitingReplySince, hasAgentEventSince, isAwaitingReply, isRunActive]);

  useEffect(() => {
    if (!isAwaitingReply || !awaitingReplySince) {
      return;
    }
    if (isRunActive || hasAgentEventSince(awaitingReplySince)) {
      return;
    }

    const sinceEpoch = Date.parse(awaitingReplySince);
    const deadline = (Number.isFinite(sinceEpoch) ? sinceEpoch : Date.now()) + AGENT_REPLY_TIMEOUT_MS;
    const remaining = Math.max(0, deadline - Date.now());

    const timer = window.setTimeout(() => {
      if (isRunActive || hasAgentEventSince(awaitingReplySince)) {
        return;
      }
      setIsAwaitingReply(false);
      runtimeStartedSinceAwaitingRef.current = false;
      setSubmitError('에이전트 응답이 지연되고 있습니다. 런타임 연결 상태를 확인해 주세요.');
    }, remaining);

    return () => {
      window.clearTimeout(timer);
    };
  }, [awaitingReplySince, hasAgentEventSince, isAwaitingReply, isRunActive]);

  useEffect(() => {
    if (!activeChatIdResolved) {
      return;
    }
    const latestThreadId = [...events]
      .reverse()
      .map((event) => (typeof event.meta?.threadId === 'string' ? event.meta.threadId.trim() : ''))
      .find((value) => value.length > 0);
    if (!latestThreadId || latestThreadId === activeChat?.threadId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(activeChatIdResolved)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId: latestThreadId }),
          },
        );
        if (!response.ok || cancelled) {
          return;
        }
        setChats((prev) => sortSessionChats(prev.map((chat) => (
          chat.id === activeChatIdResolved ? { ...chat, threadId: latestThreadId } : chat
        ))));
      } catch {
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [events, sessionId, activeChatIdResolved, activeChat?.threadId]);

  const buildChatUrl = useCallback((chatId: string) => {
    return `/sessions/${encodeURIComponent(sessionId)}?chat=${encodeURIComponent(chatId)}`;
  }, [sessionId]);

  const goToChat = useCallback((chatId: string) => {
    setChatActionMenuId(null);
    setRenamingChatId(null);
    setChatTitleDraft('');
    setSelectedChatId(chatId);
    router.push(buildChatUrl(chatId));
    if (isMobileLayout) {
      setIsChatSidebarOpen(false);
    }
  }, [router, buildChatUrl, isMobileLayout]);

  const handleCreateChat = useCallback(async (agent: AgentFlavor) => {
    if (isCreatingChat) {
      return;
    }
    setIsCreatingChat(true);
    setChatMutationError(null);
    setIsCreateChatMenuOpen(false);
    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent }),
      });
      const body = (await response.json().catch(() => ({}))) as { chat?: SessionChat; error?: string };
      if (!response.ok || !body.chat) {
        throw new Error(body.error ?? '새 채팅 생성에 실패했습니다.');
      }
      setChats((prev) => sortSessionChats([body.chat!, ...prev]));
      goToChat(body.chat.id);
    } catch (error) {
      setChatMutationError(error instanceof Error ? error.message : '새 채팅 생성에 실패했습니다.');
    } finally {
      setIsCreatingChat(false);
    }
  }, [sessionId, goToChat, isCreatingChat]);

  const handleToggleChatPin = useCallback(async (chat: SessionChat) => {
    setChatMutationLoadingId(chat.id);
    setChatMutationError(null);
    const nextPinned = !chat.isPinned;
    setChats((prev) => sortSessionChats(prev.map((item) => (
      item.id === chat.id ? { ...item, isPinned: nextPinned } : item
    ))));
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(chat.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPinned: nextPinned }),
        },
      );
      if (!response.ok) {
        throw new Error('채팅 고정 상태 변경에 실패했습니다.');
      }
    } catch (error) {
      setChats((prev) => sortSessionChats(prev.map((item) => (
        item.id === chat.id ? { ...item, isPinned: chat.isPinned } : item
      ))));
      setChatMutationError(error instanceof Error ? error.message : '채팅 고정 상태 변경에 실패했습니다.');
    } finally {
      setChatMutationLoadingId(null);
      setChatActionMenuId(null);
    }
  }, [sessionId]);

  const handleRenameChat = useCallback(async (chatId: string, nextTitle: string) => {
    const normalized = nextTitle.trim();
    if (!normalized) {
      setRenamingChatId(null);
      setChatTitleDraft('');
      return;
    }
    setChatMutationLoadingId(chatId);
    setChatMutationError(null);
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(chatId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: normalized }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { chat?: SessionChat; error?: string };
      if (!response.ok || !body.chat) {
        throw new Error(body.error ?? '채팅 이름 변경에 실패했습니다.');
      }
      setChats((prev) => sortSessionChats(prev.map((chat) => (
        chat.id === chatId ? { ...chat, title: body.chat!.title } : chat
      ))));
      setRenamingChatId(null);
      setChatTitleDraft('');
    } catch (error) {
      setChatMutationError(error instanceof Error ? error.message : '채팅 이름 변경에 실패했습니다.');
    } finally {
      setChatMutationLoadingId(null);
    }
  }, [sessionId]);

  const handleDeleteChat = useCallback(async (chat: SessionChat) => {
    if (chatMutationLoadingId) {
      return;
    }
    const confirmed = window.confirm(`'${chat.title}' 채팅을 삭제할까요?`);
    if (!confirmed) {
      return;
    }
    setChatMutationLoadingId(chat.id);
    setChatMutationError(null);
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(chat.id)}`,
        { method: 'DELETE' },
      );
      const body = (await response.json().catch(() => ({}))) as { chats?: SessionChat[]; error?: string };
      if (!response.ok || !Array.isArray(body.chats)) {
        throw new Error(body.error ?? '채팅 삭제에 실패했습니다.');
      }
      const nextChats = sortSessionChats(body.chats);
      setChats(nextChats);
      setChatActionMenuId(null);
      if (chat.id === activeChatIdResolved && nextChats[0]) {
        goToChat(nextChats[0].id);
      }
    } catch (error) {
      setChatMutationError(error instanceof Error ? error.message : '채팅 삭제에 실패했습니다.');
    } finally {
      setChatMutationLoadingId(null);
    }
  }, [activeChatIdResolved, chatMutationLoadingId, goToChat, sessionId]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const promptText = prompt.trim();
    if (!promptText || !isOperator || isAgentRunning || !activeChatIdResolved) return;

    const isFirstUserMessageInChat = !events.some((event) => isUserEvent(event));
    const shouldAutoRenameFromFirstPrompt = Boolean(
      activeChat
      && isAutoGeneratedChatTitle(activeChat.title)
      && isFirstUserMessageInChat,
    );
    const firstPromptTitle = shouldAutoRenameFromFirstPrompt
      ? buildChatTitleFromFirstPrompt(promptText)
      : null;

    const contextPrefix = contextItems.length > 0
      ? contextItems.map((item) => (
        item.type === 'file'
          ? `<file path="${item.path}">\n${item.content}\n</file>`
          : `<context>\n${item.text}\n</context>`
      )).join('\n') + '\n\n'
      : '';
    const finalText = contextPrefix + promptText;

    setIsSubmitting(true);
    setIsAwaitingReply(true);
    setAwaitingReplySince(new Date().toISOString());
    runtimeStartedSinceAwaitingRef.current = false;
    setSubmitError(null);
    setShowDisconnectRetry(false);
    disconnectNoticeAwaitingRef.current = null;
    setLastSubmittedPayload({
      text: finalText,
      chatId: activeChatIdResolved,
      agent: activeChat?.agent === 'claude' || activeChat?.agent === 'codex' || activeChat?.agent === 'gemini'
        ? activeChat.agent
        : 'codex',
      ...(activeChat?.threadId ? { threadId: activeChat.threadId } : {}),
    });

    try {
      const response = await fetch(`/api/runtime/sessions/${sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          title: 'User Instruction',
          text: finalText,
          meta: {
            role: 'user',
            chatId: activeChatIdResolved,
            agent: activeChat?.agent ?? 'codex',
            ...(activeChat?.threadId ? { threadId: activeChat.threadId } : {}),
          },
        }),
      });

      const body = (await response.json().catch(() => ({ error: '백엔드 응답을 읽을 수 없습니다.' }))) as {
        event?: UiEvent;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? '메시지 전송에 실패했습니다.');
      }

      if (body.event) {
        addEvent(body.event);
      }
      const touchedAt = new Date().toISOString();
      setChats((prev) => sortSessionChats(prev.map((chat) => (
        chat.id === activeChatIdResolved
          ? {
              ...chat,
              lastActivityAt: touchedAt,
              ...(firstPromptTitle ? { title: firstPromptTitle } : {}),
            }
          : chat
      ))));
      void fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(activeChatIdResolved)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            touchActivity: true,
            ...(firstPromptTitle ? { title: firstPromptTitle } : {}),
          }),
        },
      )
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          const payload = (await response.json().catch(() => ({}))) as { chat?: SessionChat };
          if (!payload.chat) {
            return;
          }
          setChats((prev) => sortSessionChats(prev.map((chat) => (
            chat.id === activeChatIdResolved
              ? {
                  ...chat,
                  title: payload.chat?.title ?? chat.title,
                  lastActivityAt: payload.chat?.lastActivityAt ?? chat.lastActivityAt,
                }
              : chat
          ))));
        })
        .catch(() => {
        });
      setPrompt('');
      setContextItems([]);
    } catch (error) {
      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      runtimeStartedSinceAwaitingRef.current = false;
      setSubmitError(error instanceof Error ? error.message : '백엔드 연결 상태를 확인해 주세요.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleRetryDisconnected() {
    if (!isOperator || isAgentRunning || !lastSubmittedPayload) {
      return;
    }

    setIsSubmitting(true);
    setIsAwaitingReply(true);
    setAwaitingReplySince(new Date().toISOString());
    runtimeStartedSinceAwaitingRef.current = false;
    setSubmitError(null);
    setShowDisconnectRetry(false);
    disconnectNoticeAwaitingRef.current = null;

    try {
      const response = await fetch(`/api/runtime/sessions/${sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          title: 'User Instruction',
          text: lastSubmittedPayload.text,
          meta: {
            role: 'user',
            chatId: lastSubmittedPayload.chatId,
            agent: lastSubmittedPayload.agent,
            ...(lastSubmittedPayload.threadId ? { threadId: lastSubmittedPayload.threadId } : {}),
          },
        }),
      });

      const body = (await response.json().catch(() => ({ error: '백엔드 응답을 읽을 수 없습니다.' }))) as {
        event?: UiEvent;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? '재시도 전송에 실패했습니다.');
      }

      if (body.event) {
        addEvent(body.event);
      }
    } catch (error) {
      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      runtimeStartedSinceAwaitingRef.current = false;
      setSubmitError(error instanceof Error ? error.message : '재시도 중 오류가 발생했습니다.');
      setShowDisconnectRetry(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAbortRun() {
    if (!isOperator || !isAgentRunning || isAborting) {
      return;
    }

    setIsAborting(true);

    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'abort' }),
      });
      const body = (await response.json().catch(() => ({ error: '중단 응답을 읽을 수 없습니다.' }))) as {
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? '에이전트 실행 중단에 실패했습니다.');
      }

      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      runtimeStartedSinceAwaitingRef.current = false;
      setSubmitError(null);
      setShowDisconnectRetry(false);
      disconnectNoticeAwaitingRef.current = null;
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '에이전트 실행 중단 중 오류가 발생했습니다.');
    } finally {
      setIsAborting(false);
      setIsSubmitting(false);
    }
  }

  function handleStreamScroll() {
    const stream = scrollRef.current;
    if (!stream) {
      return;
    }
    if (isMobileLayout) {
      syncScrollToBottomButton();
      return;
    }
    const nearBottom = isNearBottom(stream);
    shouldStickToBottomRef.current = nearBottom;
    setShowScrollToBottom(!nearBottom);
    if (!isLoadingOlder && hasMoreBefore && stream.scrollTop <= 96) {
      void loadOlderHistory();
    }
  }

  const activeModel = COMPOSER_MODELS.find((m) => m.id === selectedModelId) || COMPOSER_MODELS[0];

  return (
    <>
    <div
      className={`${styles.chatShell} ${
        isChatSidebarOpen ? styles.chatShellSidebarOpen : styles.chatShellSidebarClosed
      } ${isMobileLayout ? styles.chatShellMobileScroll : ''}`}
      ref={chatShellRef}
    >
      {isMobileLayout && isChatSidebarOpen && (
        <button
          type="button"
          className={styles.chatSidebarBackdrop}
          onClick={() => setIsChatSidebarOpen(false)}
          aria-label="채팅 사이드바 닫기"
        />
      )}
      <aside
        ref={chatSidebarRef}
        className={`${styles.chatSidebar} ${
          isChatSidebarOpen ? styles.chatSidebarOpen : styles.chatSidebarClosed
        } ${isMobileLayout ? styles.chatSidebarMobile : ''}`}
      >
        <div className={styles.chatSidebarHeader}>
          <div>
            <div className={styles.chatSidebarTitle}>채팅 목록</div>
            <div className={styles.chatSidebarSubTitle}>{sessionTitle}</div>
          </div>
          <div className={styles.createChatMenuWrap} ref={createChatMenuRef}>
            <button
              type="button"
              className={styles.chatSidebarNewButton}
              onClick={() => setIsCreateChatMenuOpen((prev) => !prev)}
              disabled={isCreatingChat}
              title="새 채팅"
              aria-haspopup="menu"
              aria-expanded={isCreateChatMenuOpen}
            >
              <MessageSquarePlus size={15} />
              새 채팅
              <ChevronDown size={14} />
            </button>
            {isCreateChatMenuOpen && (
              <div className={styles.createChatMenuPanel} role="menu">
                {CHAT_AGENT_CHOICES.map((choice) => {
                  const choiceMeta = resolveAgentMeta(choice);
                  const ChoiceIcon = choiceMeta.Icon;
                  return (
                    <button
                      key={choice}
                      type="button"
                      role="menuitem"
                      className={styles.createChatMenuItem}
                      onClick={() => void handleCreateChat(choice)}
                      disabled={isCreatingChat}
                    >
                      <span className={`${styles.chatListAgentAvatar} ${getAgentAvatarToneClass(choiceMeta.tone)}`}>
                        <ChoiceIcon size={11} />
                      </span>
                      <span>{choiceMeta.label} 채팅</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {chatMutationError && <div className={styles.chatSidebarError}>{chatMutationError}</div>}

        <div className={styles.chatSidebarListWrap}>
          <div className={styles.chatSidebarListHead}>
            <span className={styles.chatSidebarListLabel}>채팅 {chats.length}개</span>
          </div>
          <div className={`${styles.chatList} ${styles.chatSectionList}`}>
            {visibleChats.map((chat) => {
              const isActive = chat.id === activeChatIdResolved;
              const isRenaming = renamingChatId === chat.id;
              const rowAgentMeta = resolveAgentMeta(chat.agent);
              const RowAgentIcon = rowAgentMeta.Icon;
              const sidebarState = resolveChatSidebarState(chat);
              const sidebarStateClass = sidebarState === 'running'
                ? styles.chatListItemStateRunning
                : sidebarState === 'completed'
                  ? styles.chatListItemStateCompleted
                  : sidebarState === 'approval'
                    ? styles.chatListItemStateApproval
                    : sidebarState === 'error'
                      ? styles.chatListItemStateError
                      : '';
              const chatPreviewText = resolveChatPreviewText(chat.id);
              const approvalFeedback = approvalFeedbackByChat[chat.id];
              const hasPendingApproval = isActive && pendingPermissions.length > 0;
              const showApprovalPanel = isActive && (
                hasPendingApproval
                || sidebarApprovalLoadingChatId === chat.id
                || Boolean(approvalFeedback)
              );
              const approvalBusy = sidebarApprovalLoadingChatId === chat.id || loadingPermissionId !== null;
              return (
                <div
                  key={chat.id}
                  className={`${styles.chatListItem} ${isActive ? styles.chatListItemActive : ''} ${sidebarStateClass}`}
                >
                  <div className={styles.chatListItemTopRow}>
                    <button
                      type="button"
                      className={styles.chatListMainButton}
                      onClick={() => goToChat(chat.id)}
                      title={chat.title}
                    >
                      <span className={styles.chatListMainContent}>
                        <span className={styles.chatListTitleWrap}>
                          <span className={`${styles.chatListAgentAvatar} ${getAgentAvatarToneClass(rowAgentMeta.tone)}`}>
                            <RowAgentIcon size={11} />
                          </span>
                          {chat.isPinned && <Pin size={12} className={styles.chatListPinIcon} />}
                          {isRenaming ? (
                            <input
                              value={chatTitleDraft}
                              onChange={(event) => setChatTitleDraft(event.target.value)}
                              onClick={(event) => event.stopPropagation()}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter') {
                                  event.preventDefault();
                                  void handleRenameChat(chat.id, chatTitleDraft);
                                } else if (event.key === 'Escape') {
                                  setRenamingChatId(null);
                                  setChatTitleDraft('');
                                }
                              }}
                              onBlur={() => {
                                if (renamingChatId === chat.id) {
                                  void handleRenameChat(chat.id, chatTitleDraft);
                                }
                              }}
                              className={styles.chatListRenameInput}
                              autoFocus
                            />
                          ) : (
                            <span className={styles.chatListTitle}>{chat.title}</span>
                          )}
                        </span>
                        {!isRenaming && (
                          <span className={styles.chatListPreviewRow}>
                            <CornerDownRight size={12} className={styles.chatListPreviewIcon} />
                            <span className={styles.chatListPreviewText}>{chatPreviewText}</span>
                          </span>
                        )}
                      </span>
                      <RelativeTime timestamp={chat.lastActivityAt || chat.createdAt} className={styles.chatListTime} />
                    </button>
                    {!isRenaming && (
                      <div className={styles.chatListMenuWrap}>
                        <button
                          type="button"
                          className={styles.chatListMenuButton}
                          onClick={(event) => {
                            event.stopPropagation();
                            setChatActionMenuId((prev) => (prev === chat.id ? null : chat.id));
                          }}
                          title="채팅 메뉴"
                        >
                          <MoreVertical size={15} />
                        </button>
                        {chatActionMenuId === chat.id && (
                          <div className={styles.chatListMenuPanel}>
                            <button
                              type="button"
                              className={styles.chatListMenuItem}
                              onClick={() => {
                                setRenamingChatId(chat.id);
                                setChatTitleDraft(chat.title);
                                setChatActionMenuId(null);
                              }}
                            >
                              <Pencil size={14} />
                              이름 변경
                            </button>
                            <button
                              type="button"
                              className={styles.chatListMenuItem}
                              onClick={() => void handleToggleChatPin(chat)}
                              disabled={chatMutationLoadingId === chat.id}
                            >
                              <Pin size={14} />
                              {chat.isPinned ? '고정 해제' : '고정'}
                            </button>
                            <button
                              type="button"
                              className={`${styles.chatListMenuItem} ${styles.chatListMenuDelete}`}
                              onClick={() => void handleDeleteChat(chat)}
                              disabled={chatMutationLoadingId === chat.id}
                            >
                              <Trash2 size={14} />
                              삭제
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className={`${styles.chatListApprovalWrap} ${showApprovalPanel ? styles.chatListApprovalWrapOpen : ''}`}>
                    <div className={styles.chatListApprovalInner}>
                      {approvalFeedback ? (
                        <div
                          className={`${styles.chatListApprovalResult} ${
                            approvalFeedback === 'approved'
                              ? styles.chatListApprovalResultApproved
                              : styles.chatListApprovalResultDenied
                          }`}
                        >
                          {approvalFeedback === 'approved' ? '승인됨' : '거부됨'}
                        </div>
                      ) : (
                        <div className={styles.chatListApprovalButtons}>
                          <button
                            type="button"
                            className={styles.chatListApprovalButton}
                            onClick={() => { void handleSidebarPermissionDecision(chat.id, 'allow_once'); }}
                            disabled={!hasPendingApproval || approvalBusy}
                          >
                            {approvalBusy ? '처리 중...' : '승인'}
                          </button>
                          <button
                            type="button"
                            className={styles.chatListApprovalButton}
                            onClick={() => { void handleSidebarPermissionDecision(chat.id, 'allow_session'); }}
                            disabled={!hasPendingApproval || approvalBusy}
                          >
                            항상 승인
                          </button>
                          <button
                            type="button"
                            className={`${styles.chatListApprovalButton} ${styles.chatListApprovalButtonDeny}`}
                            onClick={() => { void handleSidebarPermissionDecision(chat.id, 'deny'); }}
                            disabled={!hasPendingApproval || approvalBusy}
                          >
                            거부
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          {hasMoreChats && (
            <button
              type="button"
              className={styles.chatSidebarLoadMoreButton}
              onClick={handleLoadMoreChats}
            >
              추가 로드
            </button>
          )}
        </div>
      </aside>

      <main className={`${styles.centerPanel} ${isMobileLayout ? styles.centerPanelMobileScroll : ''}`} ref={centerPanelRef}>
        <section className={`${styles.centerFrame} ${isMobileLayout ? styles.centerFrameMobileScroll : ''}`}>
          <header className={styles.centerHeader}>
            <button
              type="button"
              className={styles.sidebarToggleButton}
              onClick={() => setIsChatSidebarOpen((prev) => !prev)}
              aria-label={isChatSidebarOpen ? '채팅 사이드바 닫기' : '채팅 사이드바 열기'}
              title={isChatSidebarOpen ? '채팅 사이드바 닫기' : '채팅 사이드바 열기'}
            >
              {isChatSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </button>
            <span className={`${styles.agentAvatarHero} ${getAgentAvatarToneClass(agentMeta.tone)}`}>
              <agentMeta.Icon size={20} />
            </span>
            <div className={styles.centerHeaderInfo}>
              <h2 className={styles.centerTitle}>{isMobileLayout ? sessionTitle : displayName}</h2>
              {isMobileLayout ? (
                <div className={styles.centerMetaRow}>
                  <span className={styles.centerAgentLabel}>{agentMeta.label}</span>
                  <span className={styles.centerChatLabel}>{currentChatTitle}</span>
                </div>
              ) : (
                <span className={styles.centerAgentLabel}>{agentMeta.label} Agent · {sessionTitle}</span>
              )}
            </div>
            <div className={styles.centerHeaderActions}>
              <span
                className={`${styles.connectionPill} ${
                  connectionState === 'running'
                    ? styles.connectionRunning
                    : connectionState === 'connected'
                      ? styles.connectionGood
                      : styles.connectionWarn
                }`}
              >
                {connectionState === 'running' ? (
                  <Activity size={13} className={styles.connectionRunningIcon} />
                ) : connectionState === 'connected' ? (
                  <CheckCircle2 size={13} />
                ) : (
                  <CircleAlert size={13} />
                )}
                {connectionLabel}
              </span>
              <div className={styles.contextMenuWrap} ref={contextMenuRef}>
                <button
                  type="button"
                  className={styles.contextMenuButton}
                  aria-label="워크스페이스 컨텍스트 메뉴"
                  onClick={() => setIsContextMenuOpen((prev) => !prev)}
                >
                  <MoreVertical size={16} />
                </button>
                {isContextMenuOpen && (
                  <div className={styles.contextMenuPanel} role="menu">
                    <div className={styles.contextMenuMeta}>
                      <span>Policy: {approvalPolicyLabel(approvalPolicy)}</span>
                      <span>Pending: {pendingPermissions.length}</span>
                    </div>
                    <button
                      type="button"
                      className={styles.contextMenuItem}
                      disabled={!activeChatIdResolved}
                      onClick={() => {
                        void handleCopyChatTrackingIds();
                      }}
                    >
                      {chatTrackingCopyState === 'copied'
                        ? '채팅 ID/스레드 ID 복사됨'
                        : chatTrackingCopyState === 'failed'
                          ? '복사 실패 (다시 시도)'
                          : '채팅 ID/스레드 ID 복사(JSON)'}
                    </button>
                    <button
                      type="button"
                      className={styles.contextMenuItem}
                      onClick={() => {
                        setIsContextMenuOpen(false);
                        void handleAbortRun();
                      }}
                      disabled={!isOperator || !isAgentRunning || isAborting}
                    >
                      {isAborting ? '중단 중...' : '에이전트 실행 중단'}
                    </button>
                    <button
                      type="button"
                      className={styles.contextMenuItem}
                      onClick={() => {
                        setIsContextMenuOpen(false);
                        jumpToPendingPermission();
                      }}
                      disabled={pendingPermissions.length === 0}
                    >
                      대기 승인 바로 이동
                    </button>
                    <button
                      type="button"
                      className={styles.contextMenuItem}
                      onClick={() => {
                        setShowPermissionQueue((prev) => !prev);
                      }}
                    >
                      권한 요청 {showPermissionQueue ? '숨기기' : '표시하기'}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {runtimeNotice && (
            <div className={styles.noticeWrap}>
              <BackendNotice message={`백엔드 연결 상태: ${runtimeNotice}`} />
            </div>
          )}

          {showDisconnectRetry && (
            <div className={styles.disconnectNoticeBar} role="status" aria-live="polite">
              <span>에이전트 연결이 중단되었습니다.</span>
              <button
                type="button"
                className={styles.disconnectNoticeAction}
                onClick={() => {
                  void handleRetryDisconnected();
                }}
                disabled={!isOperator || isAgentRunning || isSubmitting || !lastSubmittedPayload}
              >
                {isSubmitting ? '재시도 중...' : '재시도'}
              </button>
            </div>
          )}

          {pendingPermissions.length > 0 && (
            <div className={styles.permissionNoticeBar} role="status" aria-live="polite">
              <span>승인 요청 {pendingPermissions.length}건이 대기 중입니다.</span>
              <button type="button" className={styles.permissionNoticeAction} onClick={jumpToPendingPermission}>
                바로 보기
              </button>
            </div>
          )}

          <div className={`${styles.stream} ${isMobileLayout ? styles.streamMobileScroll : ''}`} ref={scrollRef} onScroll={handleStreamScroll}>
            {timelineItems.map((timelineItem) => {
              if (timelineItem.type === 'permission') {
                const permission = timelineItem.permission;
                return (
                  <PermissionRequestMessage
                    key={permission.id}
                    anchorId={`permission-${permission.id}`}
                    permission={permission}
                    disabled={!isOperator}
                    loading={loadingPermissionId === permission.id}
                    onDecide={(permissionId, decision) => {
                      void decidePermission(permissionId, decision);
                    }}
                  />
                );
              }

              const item = timelineItem.item;
              if (item.type === 'action_overflow') {
                const overflowKindMeta = getEventKindMeta(item.kind);
                const OverflowKindIcon = overflowKindMeta.Icon;
                const title = item.expanded
                  ? '반복 행동 접기'
                  : `중간 행동 ${item.hiddenCount}개 펼치기`;
                return (
                  <article key={`overflow-${item.id}`} className={`${styles.messageRow} ${styles.messageRowAgent}`}>
                    <button
                      type="button"
                      className={`${styles.messageBubble} ${styles.messageBubbleAction} ${styles.actionOverflowBubble} ${styles.actionOverflowToggle}`}
                      onClick={() => toggleActionRun(item.runId)}
                      title={title}
                      aria-label={title}
                      aria-expanded={item.expanded}
                    >
                      <div className={styles.actionOverflowContent}>
                        {item.expanded ? (
                          <span className={styles.actionOverflowLabel}>
                            접기
                            <ChevronUp size={14} />
                          </span>
                        ) : (
                          <>
                            <div className={styles.actionOverflowLeft}>
                              <span className={`${styles.kindChip} ${getToneClass(overflowKindMeta.tone)}`}>
                                <OverflowKindIcon size={12} />
                                {overflowKindMeta.label}
                              </span>
                            </div>
                            <span className={styles.actionOverflowLabel}>
                              {item.hiddenCount}개의 행동 더 보기
                              <ChevronDown size={14} />
                            </span>
                            <div className={styles.actionOverflowRight}>
                              <span className={styles.actionOverflowCount}>+{item.hiddenCount}</span>
                            </div>
                          </>
                        )}
                      </div>
                    </button>
                  </article>
                );
              }

              const event = item.event;
              const userEvent = isUserEvent(event);
              const actionEvent = !userEvent && isActionKind(event.kind);
              const kindMeta = getEventKindMeta(event.kind);
              const KindIcon = kindMeta.Icon;

              if (userEvent) {
                return (
                  <article id={`event-${event.id}`} key={event.id} className={`${styles.messageRow} ${styles.messageRowUser}`}>
                    <div className={`${styles.msgHeader} ${styles.msgHeaderUser}`}>
                      <span className={styles.msgTime}>{formatClock(event.timestamp)}</span>
                      <span className={`${styles.msgSender} ${styles.msgSenderUser}`}>YOU</span>
                    </div>
                    <div className={`${styles.messageBubble} ${styles.messageBubbleUser} ${highlightedEventId === event.id ? styles.messageBubbleHighlight : ''}`}>
                      {renderEventPayload(event, true, Boolean(expandedResultIds[event.id]), () => toggleResult(event.id))}
                    </div>
                  </article>
                );
              }

              if (actionEvent) {
                return (
                  <article id={`event-${event.id}`} key={event.id} className={`${styles.messageRow} ${styles.messageRowAgent}`}>
                    <div className={`${styles.messageBubble} ${styles.messageBubbleAction}`}>
                      {renderEventPayload(event, false, Boolean(expandedResultIds[event.id]), () => toggleResult(event.id))}
                    </div>
                  </article>
                );
              }

              return (
                <article id={`event-${event.id}`} key={event.id} className={`${styles.messageRow} ${styles.messageRowAgent}`}>
                  <div className={styles.messageWithAvatar}>
                    <div className={`${styles.msgAvatar} ${getAgentAvatarToneClass(agentMeta.tone)}`}>
                      <agentMeta.Icon size={14} />
                    </div>
                    <div className={styles.msgBody}>
                      <div className={styles.msgHeader}>
                        <span className={styles.msgSender}>{agentMeta.label}</span>
                        <span className={styles.msgTime}>{formatClock(event.timestamp)}</span>
                      </div>
                      <div className={`${styles.messageBubble} ${styles.messageBubbleAgent}`}>
                        {kindMeta.label ? (
                          <div className={styles.messageKindRow}>
                            <span className={`${styles.kindChip} ${getToneClass(kindMeta.tone)}`}>
                              <KindIcon size={14} />
                              {kindMeta.label}
                            </span>
                          </div>
                        ) : null}
                        {renderEventPayload(event, false, Boolean(expandedResultIds[event.id]), () => toggleResult(event.id))}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {showScrollToBottom && (
            <button
              type="button"
              className={styles.scrollBottomButton}
              onClick={handleJumpToBottom}
              aria-label="맨 아래로 이동"
              title="맨 아래로 이동"
            >
              <ChevronDown size={16} />
            </button>
          )}

          <footer className={styles.composerDock} ref={composerDockRef}>
            <form onSubmit={handleSubmit} className={styles.composerForm}>
              <div className={styles.composerCard}>
                <div className={styles.composerToolbar}>
                  <div className={styles.modelSelectorWrap} ref={modelDropdownRef}>
                    <button
                      type="button"
                      className={styles.modelSelectorBtn}
                      onClick={() => setIsModelDropdownOpen((v) => !v)}
                      aria-haspopup="listbox"
                      aria-expanded={isModelDropdownOpen}
                    >
                      <ClaudeIcon size={13} />
                      <span>{activeModel.shortLabel}</span>
                      <ChevronDown size={11} />
                    </button>
                    {isModelDropdownOpen && (
                      <div className={styles.modelDropdown} role="listbox">
                        {COMPOSER_MODELS.map((model) => (
                          <button
                            key={model.id}
                            type="button"
                            role="option"
                            aria-selected={selectedModelId === model.id}
                            className={`${styles.modelOption} ${selectedModelId === model.id ? styles.modelOptionActive : ''}`}
                            onClick={() => { setSelectedModelId(model.id); setIsModelDropdownOpen(false); }}
                          >
                            <span>{model.shortLabel}</span>
                            <span className={styles.modelOptionBadge}>{model.badge}</span>
                          </button>
                        ))}
                        <div className={styles.modelDropdownNote}>모델 변경은 추후 지원 예정</div>
                      </div>
                    )}
                  </div>
                  {isAgentRunning && (
                    <div className={styles.composerRunningBadge} role="status" aria-live="polite">
                      <span className={styles.runningDots} aria-hidden>
                        <span /><span /><span />
                      </span>
                      실행 중
                    </div>
                  )}
                </div>

                {contextItems.length > 0 && (
                  <div className={styles.composerChips}>
                    {contextItems.map((item) => (
                      <span key={item.id} className={styles.contextChip}>
                        {item.type === 'file' ? <Paperclip size={11} /> : <AlignLeft size={11} />}
                        <span className={styles.contextChipLabel}>
                          {item.type === 'file' ? item.name : '텍스트'}
                        </span>
                        <button
                          type="button"
                          className={styles.contextChipRemove}
                          onClick={() => removeContextItem(item.id)}
                          aria-label="컨텍스트 제거"
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className={styles.composerInputRow}>
                  <div className={styles.plusMenuWrap} ref={plusMenuRef}>
                    <button
                      type="button"
                      className={`${styles.composerPlusBtn} ${plusMenuMode !== 'closed' ? styles.composerPlusBtnActive : ''}`}
                      onClick={() => { setPlusMenuMode((m) => m === 'closed' ? 'menu' : 'closed'); }}
                      aria-label="컨텍스트 추가"
                      title="컨텍스트 추가"
                      disabled={!isOperator}
                    >
                      <Plus size={16} />
                    </button>
                    {plusMenuMode !== 'closed' && (
                      <div className={styles.plusMenu}>
                        {plusMenuMode === 'menu' && (
                          <>
                            <button type="button" className={styles.plusMenuItem} onClick={() => { handleFileBrowserOpen(); }}>
                              <Paperclip size={14} /> 파일 첨부
                            </button>
                            <button type="button" className={styles.plusMenuItem} onClick={() => { setPlusMenuMode('text'); setTextContextInput(''); }}>
                              <AlignLeft size={14} /> 텍스트 추가
                            </button>
                          </>
                        )}
                        {/* file 모드는 모달로 처리 — 아래 fileBrowserModal 참고 */}
                        {plusMenuMode === 'text' && (
                          <div className={styles.plusMenuInputArea}>
                            <div className={styles.plusMenuInputLabel}>텍스트 입력</div>
                            <textarea
                              className={styles.plusMenuTextInput}
                              value={textContextInput}
                              onChange={(e) => setTextContextInput(e.target.value)}
                              placeholder="에이전트에게 전달할 추가 맥락 정보..."
                              rows={4}
                              autoFocus
                            />
                            <div className={styles.plusMenuActions}>
                              <button type="button" className={styles.plusMenuCancelBtn} onClick={() => setPlusMenuMode('menu')}>취소</button>
                              <button type="button" className={styles.plusMenuConfirmBtn} onClick={handleAddTextContext} disabled={!textContextInput.trim()}>추가</button>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <textarea
                    ref={composerInputRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onInput={resizeComposerInput}
                    onFocus={handleComposerFocus}
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                        handleSubmit(e);
                      }
                    }}
                    placeholder={
                      !activeChatIdResolved
                        ? '사용할 채팅을 선택하세요.'
                        : isOperator
                          ? '메시지를 입력하세요...'
                          : 'Viewer 권한입니다.'
                    }
                    disabled={!activeChatIdResolved || !isOperator || isAgentRunning}
                    className={styles.composerInput}
                  />

                  {isAgentRunning ? (
                    <button
                      type="button"
                      className={styles.composerStopBtn}
                      onClick={handleAbortRun}
                      disabled={isAborting}
                      aria-label="실행 중단"
                      title="실행 중단"
                    >
                      <Square size={13} fill="currentColor" />
                    </button>
                  ) : (
                    <button
                      type="submit"
                      disabled={!activeChatIdResolved || !prompt.trim() || !isOperator}
                      className={styles.composerSendBtn}
                      aria-label="메시지 전송"
                      title="메시지 전송 (Ctrl/Cmd + Enter)"
                    >
                      <ArrowUp size={17} />
                    </button>
                  )}
                </div>

                <div className={styles.composerHint}>
                  Ctrl + Enter로 전송
                </div>
              </div>
            </form>
          </footer>
        </section>
      </main>

      <aside className={`${styles.sidePanel} ${styles.rightPanel}`}>
        <section className={styles.panelCard}>
          <div className={styles.panelHeading}>Runtime Health</div>
          <div className={styles.healthRow}>
            <span
              className={`${styles.statusDot} ${
                connectionState === 'running'
                  ? styles.statusDotRunning
                  : connectionState === 'connected'
                    ? styles.statusDotGood
                    : styles.statusDotWarn
              }`}
            />
            <span>{connectionLabel}</span>
          </div>

          <div className={styles.statsGrid}>
            <div className={styles.statBox}>
              <span className={styles.statValue}>{events.length}</span>
              <span className={styles.statLabel}>전체 이벤트</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statValue}>{recentUserEvents.length}</span>
              <span className={styles.statLabel}>최근 입력</span>
            </div>
            <div className={styles.statBox}>
              <span className={styles.statValue}>{agentReplies}</span>
              <span className={styles.statLabel}>에이전트 응답</span>
            </div>
          </div>

          {runtimeNotice && <div className={styles.runtimeAlert}>{runtimeNotice}</div>}
        </section>

        <section className={styles.panelCard}>
          <div className={styles.panelHeading}>최근 이벤트</div>
          <div className={styles.miniList}>
            {recentEvents.length === 0 && <p className={styles.emptyHint}>표시할 이벤트가 없습니다.</p>}
            {recentEvents.map((event) => {
              const userEvent = isUserEvent(event);
              const kindMeta = getEventKindMeta(event.kind);
              const KindIcon = kindMeta.Icon;
              const miniKindLabel = userEvent ? 'YOU' : kindMeta.label;
              return (
                <button
                  key={event.id}
                  type="button"
                  className={`${styles.miniItem} ${styles.miniItemButton}`}
                  onClick={() => jumpToEvent(event.id)}
                  title="해당 이벤트로 이동"
                >
                  <RelativeTime timestamp={event.timestamp} className={styles.miniTime} />
                  <span className={styles.miniEventRow}>
                    {miniKindLabel ? (
                      <span className={`${styles.miniKindChip} ${getToneClass(kindMeta.tone)}`}>
                        <KindIcon size={11} />
                        {miniKindLabel}
                      </span>
                    ) : null}
                    <span className={styles.miniText}>{resolveRecentSummary(event)}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section className={styles.panelCard}>
          <div className={styles.panelHeading}>Workspace Controls</div>
          <div className={styles.metaLine}>
            <TerminalSquare size={14} />
            승인 정책: {approvalPolicyLabel(approvalPolicy)}
          </div>
          <div className={styles.metaLine}>
            <Activity size={14} />
            대기 승인: {pendingPermissions.length}건
          </div>
          <div className={styles.metaLine}>
            <MessageSquareText size={14} />
            연결 채널: runtime/events (SSE)
          </div>
        </section>
      </aside>
    </div>

    {/* ── 파일 탐색기 모달 ── */}
    {isMounted && plusMenuMode === 'file' && createPortal(
      <div className={styles.modalOverlay} onClick={() => setPlusMenuMode('closed')}>
        <div className={styles.fileBrowserModal} onClick={(e) => e.stopPropagation()}>
          <div className={styles.fileBrowserHeader}>
            <div className={styles.fileBrowserTitle}>파일 선택</div>
            <button type="button" className={styles.btnClose} onClick={() => setPlusMenuMode('closed')}>
              <X size={16} />
            </button>
          </div>

          {/* 검색창 */}
          <div className={styles.fileBrowserSearchBar}>
            <input
              type="text"
              className={styles.fileBrowserSearchInput}
              placeholder="파일명 검색..."
              value={fileBrowserQuery}
              onChange={(e) => { void handleFileBrowserSearch(e.target.value); }}
              autoFocus
            />
            {fileBrowserQuery && (
              <button
                type="button"
                className={styles.fileBrowserSearchClear}
                onClick={() => { setFileBrowserQuery(''); setFileBrowserSearchResults(null); }}
                aria-label="검색 초기화"
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* 검색 결과 또는 디렉토리 탐색 */}
          {fileBrowserSearchResults !== null ? (
            <div className={styles.fileBrowserList}>
              {fileBrowserSearchLoading && (
                <div className={styles.fileBrowserLoader}>검색 중...</div>
              )}
              {!fileBrowserSearchLoading && fileBrowserSearchResults.length === 0 && (
                <div className={styles.fileBrowserEmpty}>검색 결과가 없습니다</div>
              )}
              {!fileBrowserSearchLoading && fileBrowserSearchResults.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  className={`${styles.fileBrowserItem} ${item.isDirectory ? styles.fileBrowserDir : styles.fileBrowserFile}`}
                  onClick={() => {
                    if (item.isDirectory) {
                      setFileBrowserQuery('');
                      setFileBrowserSearchResults(null);
                      void fetchFileBrowserDir(item.path);
                    } else {
                      void handleFileBrowserSelect(item.path);
                    }
                  }}
                >
                  <span className={styles.fileBrowserItemIcon}>{getFileIcon(item.name, item.isDirectory)}</span>
                  <span className={styles.fileBrowserItemName}>{item.name}</span>
                  <span className={styles.fileBrowserItemPath}>{item.path}</span>
                </button>
              ))}
            </div>
          ) : (
            <>
              {/* 최근 파일 */}
              {recentAttachments.length > 0 && (
                <div className={styles.fileBrowserRecent}>
                  <div className={styles.fileBrowserSectionLabel}>
                    <Clock size={11} /> 최근 파일
                  </div>
                  {recentAttachments.map((filePath) => {
                    const name = filePath.split('/').filter(Boolean).pop() ?? filePath;
                    return (
                      <button
                        key={filePath}
                        type="button"
                        className={`${styles.fileBrowserItem} ${styles.fileBrowserFile}`}
                        onClick={() => { void handleFileBrowserSelect(filePath); }}
                      >
                        <span className={styles.fileBrowserItemIcon}>{getFileIcon(name, false)}</span>
                        <span className={styles.fileBrowserItemName}>{name}</span>
                        <span className={styles.fileBrowserItemPath}>{filePath}</span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className={styles.fileBrowserPath}>
                {fileBrowserParentPath !== null && (
                  <button
                    type="button"
                    className={styles.fileBrowserBackBtn}
                    onClick={() => { void fetchFileBrowserDir(fileBrowserParentPath!); }}
                  >
                    ← 상위 폴더
                  </button>
                )}
                <span className={styles.fileBrowserCurrentPath}>{fileBrowserPath}</span>
              </div>

              <div className={styles.fileBrowserList}>
                {fileBrowserLoading && (
                  <div className={styles.fileBrowserLoader}>불러오는 중...</div>
                )}
                {fileBrowserError && (
                  <div className={styles.fileBrowserError}>{fileBrowserError}</div>
                )}
                {!fileBrowserLoading && !fileBrowserError && fileBrowserItems.map((item) => (
                  <button
                    key={item.path}
                    type="button"
                    className={`${styles.fileBrowserItem} ${item.isDirectory ? styles.fileBrowserDir : styles.fileBrowserFile}`}
                    onClick={() => {
                      if (item.isDirectory) {
                        void fetchFileBrowserDir(item.path);
                      } else {
                        void handleFileBrowserSelect(item.path);
                      }
                    }}
                  >
                    <span className={styles.fileBrowserItemIcon}>{getFileIcon(item.name, item.isDirectory)}</span>
                    <span className={styles.fileBrowserItemName}>{item.name}</span>
                  </button>
                ))}
                {!fileBrowserLoading && !fileBrowserError && fileBrowserItems.length === 0 && (
                  <div className={styles.fileBrowserEmpty}>비어있는 디렉토리</div>
                )}
              </div>
            </>
          )}
        </div>
      </div>,
      document.body
    )}
    </>
  );
}
