'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessionEvents } from '@/lib/hooks/useSessionEvents';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Button, Badge } from '@/components/ui';
import { BackendNotice } from '@/components/ui/BackendNotice';
import {
  Activity,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Code,
  Cpu,
  FileCode2,
  MessageSquareText,
  Send,
  ShieldAlert,
  TerminalSquare,
} from 'lucide-react';
import type { PermissionRequest, UiEvent, UiEventKind } from '@/lib/happy/types';
import { ClaudeIcon, GeminiIcon, CodexIcon } from '@/components/ui/AgentIcons';
import styles from './ChatInterface.module.css';

const AGENT_REPLY_TIMEOUT_MS = 90000;
const AUTO_SCROLL_THRESHOLD_PX = 80;

type AgentMeta = {
  label: string;
  tone: 'clay' | 'mint' | 'blue';
  Icon: React.ComponentType<{ size?: number }>;
};

type Tone = 'sky' | 'amber' | 'emerald' | 'violet' | 'red';

const TONE_CLASS: Record<Tone, string> = {
  sky: styles.toneSky,
  amber: styles.toneAmber,
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
  code_read: { label: 'READ', tone: 'violet', Icon: FileCode2 },
  code_write: { label: 'WRITE', tone: 'emerald', Icon: Code },
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

function TextReply({ body, isUser }: { body: string; isUser: boolean }) {
  return <p className={isUser ? styles.userText : styles.agentText}>{body}</p>;
}

function CommandExecution({ body }: { body: string }) {
  const lines = body.split('\n');
  const command = lines[0]?.replace('$ ', '') || 'command';
  const output = lines.slice(1).join('\n').trim();
  const exitCode = body.match(/exit code: (-?\d+)/)?.[1] ?? null;

  return (
    <div className={styles.commandWrap}>
      <div className={styles.commandLine}>
        <TerminalSquare size={16} />
        <span className={styles.commandSymbol}>$</span>
        <span className={styles.commandText}>{command}</span>
      </div>
      {output && <pre className={styles.commandOutput}>{output}</pre>}
      {exitCode && (
        <div className={styles.commandFooter}>
          <span className={`${styles.exitBadge} ${exitCode === '0' ? styles.exitSuccess : styles.exitFail}`}>exit {exitCode}</span>
        </div>
      )}
    </div>
  );
}

function CodeAction({ body, kind }: { body: string; kind: 'code_read' | 'code_write' }) {
  const lines = body.split('\n');
  const path = lines[0] || 'unknown/path';
  const code = lines.slice(1).join('\n').trim();
  const isRead = kind === 'code_read';
  const kindMeta = isRead ? EVENT_KIND_META.code_read : EVENT_KIND_META.code_write;
  const KindIcon = kindMeta.Icon;

  return (
    <div className={styles.codeWrap}>
      <div className={styles.codeHeader}>
        <span className={`${styles.kindChip} ${TONE_CLASS[kindMeta.tone]}`}>
          <KindIcon size={14} />
          {kindMeta.label}
        </span>
        <span className={styles.filePath}>{path}</span>
      </div>
      {code && <pre className={styles.codeBlock}>{code}</pre>}
    </div>
  );
}

function renderEventPayload(event: UiEvent, userEvent: boolean) {
  if (userEvent) {
    return <TextReply body={event.body || event.title} isUser />;
  }

  if (event.kind === 'command_execution') {
    return <CommandExecution body={event.body} />;
  }

  if (event.kind === 'code_read' || event.kind === 'code_write') {
    return <CodeAction body={event.body} kind={event.kind} />;
  }

  return <TextReply body={event.body || event.title} isUser={false} />;
}

function hasParsedArtifacts(event: UiEvent): boolean {
  return Boolean(
    event.parsed && (
      event.parsed.commands.length > 0 ||
      event.parsed.files.length > 0 ||
      event.parsed.snippets.length > 0
    )
  );
}

function isNearBottom(element: HTMLElement): boolean {
  return element.scrollHeight - element.scrollTop - element.clientHeight <= AUTO_SCROLL_THRESHOLD_PX;
}

function EventArtifacts({ event }: { event: UiEvent }) {
  if (!event.parsed) {
    return null;
  }

  const { commands, files, snippets } = event.parsed;

  return (
    <div className={styles.artifactPanel}>
      {commands.length > 0 && (
        <div className={styles.artifactSection}>
          <div className={styles.artifactTitle}>
            <TerminalSquare size={14} />
            실행 명령어
          </div>
          <div className={styles.artifactStack}>
            {commands.map((command, index) => (
              <code key={`cmd-${index}-${command}`} className={styles.artifactCode}>
                {command}
              </code>
            ))}
          </div>
        </div>
      )}

      {files.length > 0 && (
        <div className={styles.artifactSection}>
          <div className={styles.artifactTitle}>
            <FileCode2 size={14} />
            참조 파일
          </div>
          <div className={styles.artifactStack}>
            {files.map((file, index) => (
              <code key={`file-${index}-${file}`} className={styles.artifactPath}>
                {file}
              </code>
            ))}
          </div>
        </div>
      )}

      {snippets.length > 0 && (
        <div className={styles.artifactSection}>
          <div className={styles.artifactTitle}>
            <Code size={14} />
            코드 일부
          </div>
          <div className={styles.artifactStack}>
            {snippets.map((snippet, index) => (
              <div key={`snippet-${index}-${snippet.language}`} className={styles.artifactSnippet}>
                <div className={styles.artifactSnippetLang}>{snippet.language}</div>
                <pre className={styles.artifactSnippetCode}>{snippet.code}</pre>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
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
  const scrollRef = useRef<HTMLDivElement>(null);
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
    <div className={styles.chatShell}>
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
                <span className={styles.miniText}>{event.body || event.title}</span>
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
                      {userEvent ? 'YOU' : 'ARIS'}
                    </span>
                    <span className={styles.messageTime}>{formatClock(event.timestamp)}</span>
                  </div>

                  <div className={`${styles.messageBubble} ${userEvent ? styles.messageBubbleUser : styles.messageBubbleAgent}`}>
                    {!userEvent && (
                      <div className={styles.messageKindRow}>
                        <span className={`${styles.kindChip} ${TONE_CLASS[kindMeta.tone]}`}>
                          <KindIcon size={14} />
                          {kindMeta.label}
                        </span>
                      </div>
                    )}
                    {renderEventPayload(event, userEvent)}
                    {!userEvent && hasParsedArtifacts(event) && <EventArtifacts event={event} />}
                  </div>
                </article>
              );
            })}

            {isAwaitingReply && (
              <article className={`${styles.messageRow} ${styles.messageRowAgent}`}>
                <div className={styles.messageMeta}>
                  <span className={`${styles.rolePill} ${styles.roleAgent}`}>ARIS</span>
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

          <footer className={styles.composerDock}>
            <form onSubmit={handleSubmit} className={styles.composerForm}>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmit(e);
                  }
                }}
                placeholder={isOperator ? '명령을 입력하세요. (Ctrl/Cmd + Enter 전송)' : 'Viewer 권한입니다.'}
                disabled={!isOperator || isSubmitting || isAwaitingReply}
                className={styles.composerInput}
              />
              <div className={styles.composerMeta}>
                <span className={styles.composerHint}>아이콘 중심 상태 표현 · 둥근 레이어 UI</span>
                <Button
                  type="submit"
                  disabled={!prompt.trim() || !isOperator || isAwaitingReply}
                  isLoading={isSubmitting || isAwaitingReply}
                  className={styles.sendButton}
                  title="Send message"
                >
                  {!isSubmitting && !isAwaitingReply && <Send size={16} />}
                </Button>
              </div>
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
            {recentEvents.map((event) => (
              <div key={event.id} className={styles.miniItem}>
                <span className={styles.miniTime}>{formatClock(event.timestamp)}</span>
                <span className={styles.miniText}>{event.title || event.kind}</span>
              </div>
            ))}
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
