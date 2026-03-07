'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSessionEvents } from '@/lib/hooks/useSessionEvents';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useSessionRuntime } from '@/lib/hooks/useSessionRuntime';
import { BackendNotice } from '@/components/ui/BackendNotice';
import {
  Activity,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  Cpu,
  FilePenLine,
  FileSearch,
  FolderTree,
  MessageSquareText,
  MoreVertical,
  Send,
  TerminalSquare,
} from 'lucide-react';
import type { ApprovalPolicy, PermissionRequest, UiEvent, UiEventKind, UiEventResult } from '@/lib/happy/types';
import { ClaudeIcon, GeminiIcon, CodexIcon, GitLogoIcon, DockerLogoIcon } from '@/components/ui/AgentIcons';
import { PermissionRequestMessage } from './PermissionRequestMessage';
import styles from './ChatInterface.module.css';

const AGENT_REPLY_TIMEOUT_MS = 90000;
const AUTO_SCROLL_THRESHOLD_PX = 80;
const MOBILE_LAYOUT_MAX_WIDTH_PX = 960;
const PREVIEW_MAX_LINES = 12;
const PREVIEW_MAX_CHARS = 600;
const COMPOSER_MIN_HEIGHT_PX = 52;
const COMPOSER_MAX_HEIGHT_PX = 180;
const ACTION_COLLAPSE_THRESHOLD = 4;
const READ_CURSOR_SYNC_DEBOUNCE_MS = 800;

type AgentMeta = {
  label: string;
  tone: 'clay' | 'mint' | 'blue';
  Icon: React.ComponentType<{ size?: number }>;
};

type Tone = 'sky' | 'amber' | 'cyan' | 'emerald' | 'violet' | 'red' | 'git' | 'docker';
type ActionKind = 'run_execution' | 'exec_execution' | 'git_execution' | 'docker_execution' | 'command_execution' | 'file_list' | 'file_read' | 'file_write';
type StreamRenderItem =
  | { type: 'event'; event: UiEvent }
  | { type: 'action_overflow'; id: string; runId: string; kind: ActionKind; hiddenCount: number; expanded: boolean };
type ResourceLabel =
  | { kind: 'folder'; name: FolderLabel; sourcePath?: string }
  | { kind: 'file'; name: string; extension: string; sourcePath?: string };

const TONE_CLASS: Record<Tone, string> = {
  sky: styles.toneSky,
  amber: styles.toneAmber,
  cyan: styles.toneCyan,
  emerald: styles.toneEmerald,
  violet: styles.toneViolet,
  red: styles.toneRed,
  git: styles.toneGit,
  docker: styles.toneDocker,
};

const AGENT_AVATAR_TONE_CLASS: Record<AgentMeta['tone'], string> = {
  clay: styles.agentAvatarClay,
  mint: styles.agentAvatarMint,
  blue: styles.agentAvatarBlue,
};

const FOLDER_LABELS = ['src', 'tools', 'jobs', 'scripts', 'tests'] as const;
type FolderLabel = (typeof FOLDER_LABELS)[number];

function isFolderLabel(label: string): label is FolderLabel {
  return FOLDER_LABELS.includes(label as FolderLabel);
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
    return { kind: 'folder', name: folderCandidate, sourcePath: rawPath };
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
    return { kind: 'folder', name: folderCandidate, sourcePath: normalizedPath };
  }

  return null;
}

const EVENT_KIND_META: Record<UiEventKind, { label: string; tone: Tone; Icon: React.ComponentType<{ size?: number }> }> = {
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

function truncateSingleLine(input: string, max = 68): string {
  const compact = input.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max).trimEnd()}…`;
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

function parseCodeChangeSummary(event: UiEvent): {
  files: string[];
  additions: number;
  deletions: number;
  previewLines: string[];
  fullText: string;
} {
  const fallback = fallbackResult(event);
  const fullText = (event.result?.full ?? event.result?.preview ?? fallback?.full ?? fallback?.preview ?? event.body ?? '')
    .replace(/\r\n/g, '\n')
    .trimEnd();
  const lines = fullText ? fullText.split('\n') : [];
  const files = new Set<string>();
  let additions = 0;
  let deletions = 0;

  for (const line of lines) {
    const normalized = line.trim();
    const gitFileMatch = normalized.match(/^(?:\+\+\+|---)\s+[ab]\/(.+)$/);
    if (gitFileMatch?.[1]) {
      files.add(gitFileMatch[1]);
    }
    const patchFileMatch = normalized.match(/^\*\*\*\s+(?:Update|Add|Delete)\s+File:\s+(.+)$/);
    if (patchFileMatch?.[1]) {
      files.add(patchFileMatch[1]);
    }
    if (line.startsWith('+') && !line.startsWith('+++')) {
      additions += 1;
    }
    if (line.startsWith('-') && !line.startsWith('---')) {
      deletions += 1;
    }
  }

  if (files.size === 0 && event.action?.path) {
    files.add(event.action.path);
  }

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
    previewLines,
    fullText,
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

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; language: string; code: string }
  | { type: 'table'; headers: string[]; rows: string[][]; alignments: TableAlign[] };

type TableAlign = 'left' | 'center' | 'right' | null;

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
      while (i < lines.length && /^[-*+]\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^[-*+]\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ul', items });
      continue;
    }

    if (/^\d+\.\s+/.test(trimmed)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i].trim())) {
        items.push(lines[i].trim().replace(/^\d+\.\s+/, ''));
        i += 1;
      }
      blocks.push({ type: 'ol', items });
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
            <ol key={key} className={styles.markdownList}>
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

        return (
          <pre key={key} className={styles.markdownCodeBlock}>
            {block.language && <span className={styles.markdownCodeLang}>{block.language}</span>}
            <code>{block.code}</code>
          </pre>
        );
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

  if (!expanded) {
    return (
      <div className={styles.codeChangesCompact}>
        <div className={styles.codeChangesCompactMain}>
          <div className={styles.actionCompactTopRow}>
            <span className={`${styles.kindChip} ${TONE_CLASS.emerald}`}>CHANGES</span>
            <span className={styles.actionCompactPrimary}>{compactPrimary}</span>
          </div>
          <div className={styles.codeChangesSummary}>
            <span>{summary.files.length} files</span>
            <span className={styles.codeChangesAdd}>+{summary.additions}</span>
            <span className={styles.codeChangesDel}>-{summary.deletions}</span>
          </div>
          {previewText && (
            <pre className={styles.codeChangesPreview}>{previewText}</pre>
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
            <span className={`${styles.kindChip} ${TONE_CLASS.emerald}`}>CHANGES</span>
            <span className={styles.actionPrimary}>{resolveActionPrimary(event)}</span>
          </div>
          <div className={styles.codeChangesSummary}>
            <span>{summary.files.length} files</span>
            <span className={styles.codeChangesAdd}>+{summary.additions}</span>
            <span className={styles.codeChangesDel}>-{summary.deletions}</span>
          </div>
          {summary.files.length > 0 && (
            <div className={styles.codeChangesFiles}>
              {summary.files.slice(0, 3).map((file) => (
                <span key={file} className={styles.codeChangesFile}>{file}</span>
              ))}
              {summary.files.length > 3 && <span className={styles.codeChangesFile}>+{summary.files.length - 3} more</span>}
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
        <pre className={styles.codeChangesFull}>{summary.fullText || '(no diff output)'}</pre>
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

  const kindMeta = EVENT_KIND_META[event.kind];
  const KindIcon = kindMeta.Icon;
  const fullPrimary = resolveActionPrimary(event).replace(/\s+/g, ' ').trim();
  const compactPrimary = truncateSingleLine(fullPrimary, 88);
  const resourceLabels = extractResourceLabelsFromEvent(event);

  if (!expanded) {
    return (
      <div className={styles.actionCompact}>
        <div className={styles.actionCompactMain}>
          <div className={styles.actionCompactTopRow}>
            <span className={`${styles.kindChip} ${TONE_CLASS[kindMeta.tone]}`}>
              <KindIcon size={13} />
              {kindMeta.label}
            </span>
            <span className={styles.actionCompactPrimary}>{compactPrimary}</span>
          </div>
          <ResourceLabelStrip resources={resourceLabels} />
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
            <span className={`${styles.kindChip} ${TONE_CLASS[kindMeta.tone]}`}>
              <KindIcon size={14} />
              {kindMeta.label}
            </span>
            <span className={styles.actionPrimary}>{fullPrimary}</span>
          </div>
          <ResourceLabelStrip resources={resourceLabels} />
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
      return <CodeChangesEventCard event={event} expanded={expanded} onToggle={onToggleExpand} />;
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
  isOperator: boolean;
  projectName: string;
  alias?: string | null;
  agentFlavor: string;
  approvalPolicy?: ApprovalPolicy;
}) {
  const displayName = alias || projectName;
  const {
    events,
    addEvent,
    syncError,
    loadOlder,
    hasMoreBefore,
    isLoadingOlder,
  } = useSessionEvents(sessionId, initialEvents, initialHasMoreBefore);
  const { isRunning: runtimeRunning, runtimeError } = useSessionRuntime(sessionId);
  const {
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
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isMobileLayout, setIsMobileLayout] = useState(false);
  const [expandedResultIds, setExpandedResultIds] = useState<Record<string, boolean>>({});
  const [expandedActionRunIds, setExpandedActionRunIds] = useState<Record<string, boolean>>({});
  const [isContextMenuOpen, setIsContextMenuOpen] = useState(false);
  const [showPermissionQueue, setShowPermissionQueue] = useState(true);
  const [highlightedEventId, setHighlightedEventId] = useState<string | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const chatShellRef = useRef<HTMLDivElement>(null);
  const centerPanelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const shouldStickToBottomRef = useRef(true);

  const agentMeta = resolveAgentMeta(agentFlavor);
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
  const recentPrompts = useMemo(
    () => events.filter((event) => isUserEvent(event)).slice(-6).reverse(),
    [events]
  );
  const agentReplies = useMemo(() => events.filter((event) => !isUserEvent(event)).length, [events]);
  const streamItems = useMemo(() => buildStreamRenderItems(events, expandedActionRunIds), [events, expandedActionRunIds]);
  const firstPendingPermissionId = pendingPermissions[0]?.id ?? null;
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
        // syncError state is managed by the hook.
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
        // syncError state is managed by the hook.
      });
      return;
    }

    const previousHeight = stream.scrollHeight;
    const previousTop = stream.scrollTop;
    await loadOlder().catch(() => {
      // syncError state is managed by the hook.
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
      return;
    }

    const updateStickState = () => {
      shouldStickToBottomRef.current = isNearWindowBottom();
    };

    // Defer initial stick-state measurement so first-entry auto-scroll can anchor to latest chat.
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
  }, [isMobileLayout]);

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
    if (!shouldStickToBottomRef.current) {
      return;
    }
    scrollConversationToBottom('auto');

    // Run follow-up syncs for layout shifts (composer/header metrics) right after mount/update.
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

  useEffect(() => {
    if (!awaitingReplySince) {
      return;
    }

    const sinceEpoch = Date.parse(awaitingReplySince);
    const hasAnyAgentEvent = events.some((event) => {
      if (isUserEvent(event) || !event.body.trim()) {
        return false;
      }

      const eventEpoch = Date.parse(event.timestamp);
      if (!Number.isFinite(sinceEpoch) || !Number.isFinite(eventEpoch)) {
        return true;
      }
      return eventEpoch >= sinceEpoch;
    });

    if (!isRunActive && hasAnyAgentEvent) {
      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      setSubmitError(null);
    }
  }, [events, awaitingReplySince, isRunActive]);

  useEffect(() => {
    if (!isAwaitingReply || !awaitingReplySince) {
      return;
    }

    const sinceEpoch = Date.parse(awaitingReplySince);
    const deadline = (Number.isFinite(sinceEpoch) ? sinceEpoch : Date.now()) + AGENT_REPLY_TIMEOUT_MS;
    const remaining = Math.max(0, deadline - Date.now());

    const timer = window.setTimeout(() => {
      setIsAwaitingReply(false);
      setSubmitError('에이전트 응답이 지연되고 있습니다. 런타임 연결 상태를 확인해 주세요.');
    }, remaining);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isAwaitingReply, awaitingReplySince]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !isOperator || isAgentRunning) return;

    setIsSubmitting(true);
    setIsAwaitingReply(true);
    setAwaitingReplySince(new Date().toISOString());
    setSubmitError(null);

    try {
      const response = await fetch(`/api/runtime/sessions/${sessionId}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          title: 'User Instruction',
          text: prompt,
          meta: { role: 'user' },
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
      setPrompt('');
    } catch (error) {
      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      setSubmitError(error instanceof Error ? error.message : '백엔드 연결 상태를 확인해 주세요.');
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
      setSubmitError(null);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : '에이전트 실행 중단 중 오류가 발생했습니다.');
    } finally {
      setIsAborting(false);
      setIsSubmitting(false);
    }
  }

  function handleStreamScroll() {
    if (isMobileLayout) {
      return;
    }
    const stream = scrollRef.current;
    if (!stream) {
      return;
    }
    shouldStickToBottomRef.current = isNearBottom(stream);
    if (!isLoadingOlder && hasMoreBefore && stream.scrollTop <= 96) {
      void loadOlderHistory();
    }
  }

  return (
    <div className={`${styles.chatShell} ${isMobileLayout ? styles.chatShellMobileScroll : ''}`} ref={chatShellRef}>
      <aside className={`${styles.sidePanel} ${styles.leftPanel}`}>
        <section className={styles.panelCard}>
          <div className={styles.panelHeading}>Session Profile</div>
          <div className={styles.sessionTitle}>{displayName}</div>

          <div className={styles.agentProfile}>
            <span className={`${styles.agentAvatar} ${AGENT_AVATAR_TONE_CLASS[agentMeta.tone]}`}>
              <agentMeta.Icon size={18} />
            </span>
            <span className={styles.agentProfileText}>
              <span className={styles.agentProfileName}>{agentMeta.label}</span>
              <span className={styles.agentProfileMeta}>{agentMeta.label} Runtime Agent</span>
            </span>
          </div>

          <div className={styles.metaLine}>
            <Cpu size={14} />
            ID: {sessionId}
          </div>
          <div className={styles.metaLine}>
            <Clock3 size={14} />
            마지막 이벤트: {events.length > 0 ? formatRelative(events[events.length - 1].timestamp) : '없음'}
          </div>
        </section>

        <section className={styles.panelCard}>
          <div className={styles.panelHeading}>최근 사용자 입력</div>
          <div className={styles.miniList}>
            {recentPrompts.length === 0 && <p className={styles.emptyHint}>아직 입력된 메시지가 없습니다.</p>}
            {recentPrompts.map((event) => (
              <button
                key={event.id}
                type="button"
                className={`${styles.miniItem} ${styles.miniItemButton}`}
                onClick={() => jumpToEvent(event.id)}
                title="해당 사용자 메시지로 이동"
              >
                <span className={styles.miniTime}>{formatClock(event.timestamp)}</span>
                <span className={styles.miniText}>{truncateSingleLine(event.body || event.title)}</span>
              </button>
            ))}
          </div>
        </section>
      </aside>

      <main className={`${styles.centerPanel} ${isMobileLayout ? styles.centerPanelMobileScroll : ''}`} ref={centerPanelRef}>
        <section className={`${styles.centerFrame} ${isMobileLayout ? styles.centerFrameMobileScroll : ''}`}>
          <header className={styles.centerHeader}>
            <span className={`${styles.agentAvatarHero} ${AGENT_AVATAR_TONE_CLASS[agentMeta.tone]}`}>
              <agentMeta.Icon size={20} />
            </span>
            <div className={styles.centerHeaderInfo}>
              <h2 className={styles.centerTitle}>{displayName}</h2>
              <span className={styles.centerAgentLabel}>{agentMeta.label} Agent</span>
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
                  aria-label="세션 컨텍스트 메뉴"
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

          {pendingPermissions.length > 0 && (
            <div className={styles.permissionNoticeBar} role="status" aria-live="polite">
              <span>승인 요청 {pendingPermissions.length}건이 대기 중입니다.</span>
              <button type="button" className={styles.permissionNoticeAction} onClick={jumpToPendingPermission}>
                바로 보기
              </button>
            </div>
          )}

          <div className={`${styles.stream} ${isMobileLayout ? styles.streamMobileScroll : ''}`} ref={scrollRef} onScroll={handleStreamScroll}>
            {streamItems.map((item) => {
              if (item.type === 'action_overflow') {
                const overflowKindMeta = EVENT_KIND_META[item.kind];
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
                      <div className={styles.actionCompact}>
                        <div className={styles.actionCompactMain}>
                          <div className={styles.actionCompactTopRow}>
                            <span className={`${styles.kindChip} ${TONE_CLASS[overflowKindMeta.tone]}`}>
                              <OverflowKindIcon size={13} />
                              {overflowKindMeta.label}
                            </span>
                            <span className={styles.actionOverflowDots}>...</span>
                          </div>
                        </div>
                        <span
                          className={styles.actionOverflowCount}
                          title={item.expanded ? '접기' : `중간 행동 ${item.hiddenCount}개 축약됨`}
                          aria-label={item.expanded ? '접기' : `중간 행동 ${item.hiddenCount}개 축약됨`}
                        >
                          {item.expanded ? '접기' : `+${item.hiddenCount}`}
                        </span>
                      </div>
                    </button>
                  </article>
                );
              }

              const event = item.event;
              const userEvent = isUserEvent(event);
              const actionEvent = !userEvent && isActionKind(event.kind);
              const kindMeta = EVENT_KIND_META[event.kind] ?? EVENT_KIND_META.unknown;
              const KindIcon = kindMeta.Icon;

              // 사용자 메시지 (오른쪽 버블)
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

              // 에이전트 액션 이벤트 (아바타 없이, 컴팩트 카드)
              if (actionEvent) {
                return (
                  <article key={event.id} className={`${styles.messageRow} ${styles.messageRowAgent}`}>
                    <div className={`${styles.messageBubble} ${styles.messageBubbleAction}`}>
                      {renderEventPayload(event, false, Boolean(expandedResultIds[event.id]), () => toggleResult(event.id))}
                    </div>
                  </article>
                );
              }

              // 에이전트 텍스트 메시지 (아바타 + 이름 헤더)
              return (
                <article key={event.id} className={`${styles.messageRow} ${styles.messageRowAgent}`}>
                  <div className={styles.messageWithAvatar}>
                    <div className={`${styles.msgAvatar} ${AGENT_AVATAR_TONE_CLASS[agentMeta.tone]}`}>
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
                            <span className={`${styles.kindChip} ${TONE_CLASS[kindMeta.tone]}`}>
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
            {showPermissionQueue && pendingPermissions.map((permission) => (
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
            ))}
          </div>

          <footer className={styles.composerDock} ref={composerDockRef}>
            <form onSubmit={handleSubmit} className={styles.composerForm}>
              {isAgentRunning && (
                <div className={styles.runningStatusBar} role="status" aria-live="polite">
                  <span className={styles.runningStatusText}>
                    <span className={styles.runningDots} aria-hidden>
                      <span />
                      <span />
                      <span />
                    </span>
                    에이전트 실행 중...
                  </span>
                </div>
              )}
              <div className={styles.composerDockInner}>
                <div className={styles.composerFloating}>
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
                    placeholder={isOperator ? '명령을 입력하세요. (Ctrl/Cmd + Enter 전송)' : 'Viewer 권한입니다.'}
                    disabled={!isOperator || isAgentRunning}
                    className={styles.composerInput}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!prompt.trim() || !isOperator || isAgentRunning}
                  className={styles.sendIconButton}
                  title="Send message"
                  aria-label="메시지 전송"
                >
                  {isAgentRunning ? (
                    <span className={styles.sendSpinner} aria-hidden />
                  ) : (
                    <Send size={20} />
                  )}
                </button>
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
              <span className={styles.statValue}>{recentPrompts.length}</span>
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
              const kindMeta = EVENT_KIND_META[event.kind] ?? EVENT_KIND_META.unknown;
              const KindIcon = kindMeta.Icon;
              const miniKindLabel = userEvent ? 'YOU' : kindMeta.label;
              return (
                <div key={event.id} className={styles.miniItem}>
                  <span className={styles.miniTime}>{formatClock(event.timestamp)}</span>
                  <span className={styles.miniEventRow}>
                    {miniKindLabel ? (
                      <span className={`${styles.miniKindChip} ${TONE_CLASS[kindMeta.tone]}`}>
                        <KindIcon size={11} />
                        {miniKindLabel}
                      </span>
                    ) : null}
                    <span className={styles.miniText}>{resolveRecentSummary(event)}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className={styles.panelCard}>
          <div className={styles.panelHeading}>Session Controls</div>
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
  );
}
