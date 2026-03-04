'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSessionEvents } from '@/lib/hooks/useSessionEvents';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Button, Badge } from '@/components/ui';
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
  Send,
  ShieldAlert,
  TerminalSquare,
} from 'lucide-react';
import type { PermissionRequest, UiEvent, UiEventKind, UiEventResult } from '@/lib/happy/types';
import { ClaudeIcon, GeminiIcon, CodexIcon } from '@/components/ui/AgentIcons';
import styles from './ChatInterface.module.css';

const AGENT_REPLY_TIMEOUT_MS = 90000;
const AUTO_SCROLL_THRESHOLD_PX = 80;
const PREVIEW_MAX_LINES = 12;
const PREVIEW_MAX_CHARS = 600;
const COMPOSER_MIN_HEIGHT_PX = 52;
const COMPOSER_MAX_HEIGHT_PX = 180;

type AgentMeta = {
  label: string;
  tone: 'clay' | 'mint' | 'blue';
  Icon: React.ComponentType<{ size?: number }>;
};

type Tone = 'sky' | 'amber' | 'cyan' | 'emerald' | 'violet' | 'red';
type ActionKind = 'command_execution' | 'file_list' | 'file_read' | 'file_write';

const TONE_CLASS: Record<Tone, string> = {
  sky: styles.toneSky,
  amber: styles.toneAmber,
  cyan: styles.toneCyan,
  emerald: styles.toneEmerald,
  violet: styles.toneViolet,
  red: styles.toneRed,
};

const AGENT_TONE_CLASS: Record<AgentMeta['tone'], string> = {
  clay: styles.agentToneClay,
  mint: styles.agentToneMint,
  blue: styles.agentToneBlue,
};

const EVENT_KIND_META: Record<UiEventKind, { label: string; tone: Tone; Icon: React.ComponentType<{ size?: number }> }> = {
  text_reply: { label: 'TEXT', tone: 'sky', Icon: MessageSquareText },
  command_execution: { label: 'COMMAND', tone: 'amber', Icon: TerminalSquare },
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
  return kind === 'command_execution' || kind === 'file_list' || kind === 'file_read' || kind === 'file_write';
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

function resolveActionResultLine(event: UiEvent): string {
  const result = event.result ?? fallbackResult(event);
  if (!result?.preview) {
    return '결과 없음';
  }
  const firstLine = result.preview
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return truncateSingleLine(firstLine ?? result.preview.replace(/\n/g, ' '), 92);
}

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_THRESHOLD_PX;
}

type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'paragraph'; text: string }
  | { type: 'ul'; items: string[] }
  | { type: 'ol'; items: string[] }
  | { type: 'quote'; text: string }
  | { type: 'code'; language: string; code: string };

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
  const pattern = /(\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|`([^`]+)`|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*]+)\*|_([^_]+)_)/g;
  const result: ReactNode[] = [];
  let cursor = 0;
  let token = 0;

  for (const match of text.matchAll(pattern)) {
    const index = match.index ?? 0;
    if (index > cursor) {
      result.push(text.slice(cursor, index));
    }

    if (match[2] && match[3]) {
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
  const primary = truncateSingleLine(resolveActionPrimary(event), 88);
  const resultLine = resolveActionResultLine(event);

  if (!expanded) {
    return (
      <div className={styles.actionCompact}>
        <div className={styles.actionCompactMain}>
          <span className={`${styles.kindChip} ${TONE_CLASS[kindMeta.tone]}`}>
            <KindIcon size={13} />
            {kindMeta.label}
          </span>
          <span className={styles.actionCompactPrimary}>{primary}</span>
          <span className={styles.actionCompactResult}>{resultLine}</span>
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
          <span className={`${styles.kindChip} ${TONE_CLASS[kindMeta.tone]}`}>
            <KindIcon size={14} />
            {kindMeta.label}
          </span>
          <span className={styles.actionPrimary}>{primary}</span>
          <span className={styles.actionCompactResult}>{resultLine}</span>
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
    return <ActionEventCard event={event} expanded={expanded} onToggle={onToggleExpand} />;
  }

  return <TextReply body={event.body || event.title} isUser={false} />;
}

export function ChatInterface({
  sessionId,
  initialEvents,
  initialPermissions,
  isOperator,
  projectName,
  alias,
  agentFlavor,
}: {
  sessionId: string;
  initialEvents: UiEvent[];
  initialPermissions: PermissionRequest[];
  isOperator: boolean;
  projectName: string;
  alias?: string | null;
  agentFlavor: string;
}) {
  const displayName = alias || projectName;
  const { events, addEvent, syncError } = useSessionEvents(sessionId, initialEvents);
  const {
    pendingPermissions,
    loadingPermissionId,
    decidePermission,
    error: permissionError,
  } = usePermissions(sessionId, initialPermissions);

  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [awaitingReplySince, setAwaitingReplySince] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [expandedResultIds, setExpandedResultIds] = useState<Record<string, boolean>>({});
  const chatShellRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const shouldStickToBottomRef = useRef(true);

  const agentMeta = resolveAgentMeta(agentFlavor);
  const runtimeNotice = submitError ?? permissionError ?? syncError ?? null;
  const connectionState = runtimeNotice ? 'degraded' : 'connected';
  const connectionLabel = connectionState === 'connected' ? '정상 연결' : '응답 지연 또는 연결 확인 필요';

  const recentEvents = useMemo(() => [...events].slice(-10).reverse(), [events]);
  const recentPrompts = useMemo(
    () => events.filter((event) => isUserEvent(event)).slice(-6).reverse(),
    [events]
  );
  const agentReplies = useMemo(() => events.filter((event) => !isUserEvent(event)).length, [events]);

  const toggleResult = useCallback((eventId: string) => {
    setExpandedResultIds((prev) => ({
      ...prev,
      [eventId]: !prev[eventId],
    }));
  }, []);

  const syncComposerDockMetrics = useCallback(() => {
    const shell = chatShellRef.current;
    const dock = composerDockRef.current;
    if (!shell || !dock) {
      return;
    }

    const height = Math.ceil(dock.getBoundingClientRect().height);
    shell.style.setProperty('--composer-dock-height', `${height}px`);
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

  const handleComposerFocus = useCallback(() => {
    const stream = scrollRef.current;
    if (!stream) {
      return;
    }
    shouldStickToBottomRef.current = true;
    requestAnimationFrame(() => {
      stream.scrollTop = stream.scrollHeight;
    });
  }, []);

  useEffect(() => {
    resizeComposerInput();
  }, [prompt, resizeComposerInput]);

  useEffect(() => {
    syncComposerDockMetrics();
    const handleResize = () => syncComposerDockMetrics();
    window.addEventListener('resize', handleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, [syncComposerDockMetrics]);

  useEffect(() => {
    const stream = scrollRef.current;
    if (!stream || !shouldStickToBottomRef.current) {
      return;
    }
    stream.scrollTop = stream.scrollHeight;
  }, [events, isAwaitingReply]);

  useEffect(() => {
    if (!isAwaitingReply || !awaitingReplySince) {
      return;
    }

    const sinceEpoch = Date.parse(awaitingReplySince);
    const hasAgentReply = events.some((event) => {
      if (isUserEvent(event) || !event.body.trim()) {
        return false;
      }

      const eventEpoch = Date.parse(event.timestamp);
      if (!Number.isFinite(sinceEpoch) || !Number.isFinite(eventEpoch)) {
        return true;
      }
      return eventEpoch >= sinceEpoch;
    });

    if (hasAgentReply) {
      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      setSubmitError(null);
    }
  }, [events, isAwaitingReply, awaitingReplySince]);

  useEffect(() => {
    if (!isAwaitingReply || !awaitingReplySince) {
      return;
    }

    const sinceEpoch = Date.parse(awaitingReplySince);
    const deadline = (Number.isFinite(sinceEpoch) ? sinceEpoch : Date.now()) + AGENT_REPLY_TIMEOUT_MS;
    const remaining = Math.max(0, deadline - Date.now());

    const timer = window.setTimeout(() => {
      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      setSubmitError('에이전트 응답이 지연되고 있습니다. 런타임 연결 상태를 확인해 주세요.');
    }, remaining);

    return () => {
      window.clearTimeout(timer);
    };
  }, [isAwaitingReply, awaitingReplySince]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!prompt.trim() || !isOperator || isSubmitting || isAwaitingReply) return;

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

  function handleStreamScroll() {
    const stream = scrollRef.current;
    if (!stream) {
      return;
    }
    shouldStickToBottomRef.current = isNearBottom(stream);
  }

  return (
    <div className={styles.chatShell} ref={chatShellRef}>
      <aside className={`${styles.sidePanel} ${styles.leftPanel}`}>
        <section className={styles.panelCard}>
          <div className={styles.panelHeading}>Session Profile</div>
          <div className={styles.sessionTitle}>{displayName}</div>

          <div className={styles.agentBadgeRow}>
            <Badge variant="sky">
              <agentMeta.Icon size={12} />
              {agentMeta.label}
            </Badge>
            <span className={`${styles.agentTone} ${AGENT_TONE_CLASS[agentMeta.tone]}`}>
              {agentMeta.tone}
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
              <div key={event.id} className={styles.miniItem}>
                <span className={styles.miniTime}>{formatClock(event.timestamp)}</span>
                <span className={styles.miniText}>{truncateSingleLine(event.body || event.title)}</span>
              </div>
            ))}
          </div>
        </section>
      </aside>

      <main className={styles.centerPanel}>
        <section className={styles.centerFrame}>
          <header className={styles.centerHeader}>
            <div className={styles.centerHeaderLeft}>
              <h2 className={styles.centerTitle}>{displayName}</h2>
              <Badge variant="sky">
                <agentMeta.Icon size={12} />
                {agentMeta.label}
              </Badge>
            </div>
            <div className={styles.centerHeaderRight}>
              <span className={`${styles.connectionPill} ${connectionState === 'connected' ? styles.connectionGood : styles.connectionWarn}`}>
                {connectionState === 'connected' ? <CheckCircle2 size={14} /> : <CircleAlert size={14} />}
                {connectionLabel}
              </span>
            </div>
          </header>

          {runtimeNotice && (
            <div className={styles.noticeWrap}>
              <BackendNotice message={`백엔드 연결 상태: ${runtimeNotice}`} />
            </div>
          )}

          <div className={styles.stream} ref={scrollRef} onScroll={handleStreamScroll}>
            {events.map((event) => {
              const userEvent = isUserEvent(event);
              const kindMeta = EVENT_KIND_META[event.kind] ?? EVENT_KIND_META.unknown;
              const KindIcon = kindMeta.Icon;

              return (
                <article
                  key={event.id}
                  className={`${styles.messageRow} ${userEvent ? styles.messageRowUser : styles.messageRowAgent}`}
                >
                  <div className={`${styles.messageMeta} ${userEvent ? styles.messageMetaUser : ''}`}>
                    <span className={`${styles.rolePill} ${userEvent ? styles.roleUser : styles.roleAgent}`}>
                      {userEvent ? (
                        'YOU'
                      ) : (
                        <>
                          <agentMeta.Icon size={12} />
                          {agentMeta.label}
                        </>
                      )}
                    </span>
                    <span className={styles.messageTime}>{formatClock(event.timestamp)}</span>
                  </div>

                  <div className={`${styles.messageBubble} ${userEvent ? styles.messageBubbleUser : styles.messageBubbleAgent}`}>
                    {!userEvent && !isActionKind(event.kind) && (
                      <div className={styles.messageKindRow}>
                        <span className={`${styles.kindChip} ${TONE_CLASS[kindMeta.tone]}`}>
                          <KindIcon size={14} />
                          {kindMeta.label}
                        </span>
                      </div>
                    )}
                    {renderEventPayload(
                      event,
                      userEvent,
                      Boolean(expandedResultIds[event.id]),
                      () => toggleResult(event.id)
                    )}
                  </div>
                </article>
              );
            })}

            {isAwaitingReply && (
              <article className={`${styles.messageRow} ${styles.messageRowAgent}`}>
                <div className={styles.messageMeta}>
                  <span className={`${styles.rolePill} ${styles.roleAgent}`}>
                    <agentMeta.Icon size={12} />
                    {agentMeta.label}
                  </span>
                  <span className={styles.messageTime}>생성 중...</span>
                </div>
                <div className={`${styles.messageBubble} ${styles.messageBubbleAgent}`} role="status" aria-live="polite">
                  <div className={styles.pendingRow}>
                    <span className={styles.pendingSpinner} aria-hidden />
                    <span className={styles.agentText}>응답을 생성하고 있습니다...</span>
                  </div>
                </div>
              </article>
            )}
          </div>

          {pendingPermissions.length > 0 && (
            <section className={styles.permissionTray}>
              <div className={styles.permissionTrayHeader}>
                <ShieldAlert size={16} />
                승인 대기 {pendingPermissions.length}건
              </div>

              <div className={styles.permissionList}>
                {pendingPermissions.map((permission) => (
                  <article key={permission.id} className={styles.permissionItem}>
                    <div className={styles.permissionCommand}>{permission.command}</div>
                    <div className={styles.permissionReason}>{permission.reason}</div>

                    <div className={styles.permissionActions}>
                      <Button
                        type="button"
                        variant="secondary"
                        className={styles.permissionBtn}
                        onClick={() => void decidePermission(permission.id, 'deny')}
                        disabled={loadingPermissionId === permission.id}
                      >
                        거절
                      </Button>
                      <Button
                        type="button"
                        className={styles.permissionBtnAllowSession}
                        onClick={() => void decidePermission(permission.id, 'allow_session')}
                        disabled={loadingPermissionId === permission.id}
                      >
                        세션 허용
                      </Button>
                      <Button
                        type="button"
                        className={styles.permissionBtnAllowOnce}
                        onClick={() => void decidePermission(permission.id, 'allow_once')}
                        disabled={loadingPermissionId === permission.id}
                      >
                        1회 허용
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}

          <footer className={styles.composerDock} ref={composerDockRef}>
            <form onSubmit={handleSubmit} className={styles.composerForm}>
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
                    disabled={!isOperator || isSubmitting || isAwaitingReply}
                    className={styles.composerInput}
                  />
                </div>
                <button
                  type="submit"
                  disabled={!prompt.trim() || !isOperator || isSubmitting || isAwaitingReply}
                  className={styles.sendIconButton}
                  title="Send message"
                  aria-label="메시지 전송"
                >
                  {isSubmitting || isAwaitingReply ? (
                    <span className={styles.sendSpinner} aria-hidden />
                  ) : (
                    <Send size={18} />
                  )}
                </button>
              </div>
              <span className={styles.composerHint}>행동별 아이콘 · 색상 구분 · 결과 프리뷰 확장</span>
            </form>
          </footer>
        </section>
      </main>

      <aside className={`${styles.sidePanel} ${styles.rightPanel}`}>
        <section className={styles.panelCard}>
          <div className={styles.panelHeading}>Runtime Health</div>
          <div className={styles.healthRow}>
            <span className={`${styles.statusDot} ${connectionState === 'connected' ? styles.statusDotGood : styles.statusDotWarn}`} />
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
              return (
                <div key={event.id} className={styles.miniItem}>
                  <span className={styles.miniTime}>{formatClock(event.timestamp)}</span>
                  <span className={styles.miniEventRow}>
                    <span className={`${styles.miniKindChip} ${TONE_CLASS[kindMeta.tone]}`}>
                      <KindIcon size={11} />
                      {userEvent ? 'YOU' : kindMeta.label}
                    </span>
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
            <Activity size={14} />
            대기 승인: {pendingPermissions.length}건
          </div>
          <div className={styles.metaLine}>
            <MessageSquareText size={14} />
            연결 채널: runtime/events
          </div>
        </section>
      </aside>
    </div>
  );
}
