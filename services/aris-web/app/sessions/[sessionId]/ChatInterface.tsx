'use client';

import { useState, useRef, useEffect } from 'react';
import { useSessionEvents } from '@/lib/hooks/useSessionEvents';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { Button, Card, Badge } from '@/components/ui';
import { BackendNotice } from '@/components/ui/BackendNotice';
import { Send, TerminalSquare, FileCode2, Code, ShieldAlert, Cpu } from 'lucide-react';
import type { UiEvent, PermissionRequest } from '@/lib/happy/types';
import { ClaudeIcon, GeminiIcon, CodexIcon } from '@/components/ui/AgentIcons';

const AGENT_REPLY_TIMEOUT_MS = 90000;

// Response Type Renderers
const TextReply = ({ body }: { body: string }) => (
  <div className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{body}</div>
);

const CommandExecution = ({ body }: { body: string }) => {
  const lines = body.split('\n');
  const command = lines[0]?.replace('$ ', '') || '';
  const output = lines.slice(1).join('\n');
  const exitCode = body.match(/exit code: (-?\d+)/)?.[1];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: '0.8125rem', padding: '0.5rem 0.75rem', background: 'var(--surface-soft)', borderRadius: 'var(--radius-sm)', borderLeft: '3px solid var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <TerminalSquare size={16} color="var(--text-muted)" />
        <span style={{ color: 'var(--text-muted)', marginRight: '0.25rem' }}>$</span>{command}
      </div>
      {output && (
        <pre className="no-scrollbar" style={{ margin: 0, padding: '0.75rem', background: '#1e1e1e', color: '#d4d4d4', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
          {output}
        </pre>
      )}
      {exitCode && (
        <div style={{ textAlign: 'right' }}>
          <Badge variant={exitCode === '0' ? 'emerald' : 'red'}>exit {exitCode}</Badge>
        </div>
      )}
    </div>
  );
};

const CodeAction = ({ body, kind }: { body: string; kind: 'code_read' | 'code_write' }) => {
  const lines = body.split('\n');
  const path = lines[0] || 'Unknown path';
  const code = lines.slice(1).join('\n');
  const isRead = kind === 'code_read';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div className="text-sm" style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Badge variant={isRead ? 'violet' : 'emerald'}>
          {isRead ? <FileCode2 size={12} /> : <Code size={12} />}
          {isRead ? 'READ' : 'WRITE'}
        </Badge>
        <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', fontSize: '0.75rem', wordBreak: 'break-all' }}>{path}</span>
      </div>
      {code && (
        <pre className="no-scrollbar" style={{ margin: 0, padding: '0.75rem', background: 'var(--surface-subtle)', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', fontSize: '0.75rem', overflowX: 'auto', fontFamily: 'var(--font-mono)' }}>
          {code}
        </pre>
      )}
    </div>
  );
};

export function ChatInterface({
  sessionId,
  initialEvents,
  initialPermissions,
  isOperator,
  projectName,
  alias,
  agentFlavor
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
  const { pendingPermissions, decidePermission, error: permissionError } = usePermissions(sessionId, initialPermissions);
  const [prompt, setPrompt] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAwaitingReply, setIsAwaitingReply] = useState(false);
  const [awaitingReplySince, setAwaitingReplySince] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, isAwaitingReply]);

  useEffect(() => {
    if (!isAwaitingReply || !awaitingReplySince) {
      return;
    }

    const sinceEpoch = Date.parse(awaitingReplySince);
    const hasAgentReply = events.some((event) => {
      const isUserEvent = event.meta?.role === 'user' || event.title === 'User Instruction';
      if (isUserEvent || !event.body.trim()) {
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
          meta: { role: 'user' }
        }),
      });

      const body = (await response.json().catch(() => ({ error: '백엔드 응답을 읽을 수 없습니다.' }))) as {
        event?: UiEvent;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? '메시지 전송에 실패했습니다.');
      }

      if (body.event) addEvent(body.event);
      setPrompt('');
    } catch (error) {
      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      setSubmitError(error instanceof Error ? error.message : '백엔드 연결 상태를 확인해 주세요.');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const runtimeNotice = submitError ?? permissionError ?? syncError ?? null;
  const connectionState = runtimeNotice ? 'degraded' : 'connected';
  const recentEvents = [...events].slice(-10).reverse();
  const recentPrompts = events
    .filter((event) => event.meta?.role === 'user' || event.title === 'User Instruction')
    .slice(-6)
    .reverse();

  return (
    <div className="chat-desktop-shell">
      <aside className="chat-left-panel">
        <Card className="chat-panel-card">
          <div className="chat-panel-title">세션</div>
          <div className="chat-session-name">{displayName}</div>
          <Badge variant="sky">
            {agentFlavor === 'claude' && <ClaudeIcon size={12} />}
            {agentFlavor === 'gemini' && <GeminiIcon size={12} />}
            {agentFlavor === 'codex' && <CodexIcon size={12} />}
            {!['claude', 'gemini', 'codex'].includes(agentFlavor) && <Cpu size={12} />}
            {agentFlavor}
          </Badge>
          <div className="chat-panel-meta">ID: {sessionId}</div>
        </Card>

        <Card className="chat-panel-card">
          <div className="chat-panel-title">최근 사용자 입력</div>
          <div className="chat-list-stack">
            {recentPrompts.length === 0 && (
              <p className="text-sm text-muted">아직 입력된 메시지가 없습니다.</p>
            )}
            {recentPrompts.map((event) => (
              <div key={event.id} className="chat-mini-log-item">
                <span className="chat-mini-log-time">
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="chat-mini-log-text">{event.body || event.title}</span>
              </div>
            ))}
          </div>
        </Card>
      </aside>

      <main className="chat-center-panel">
        <div className="chat-center-frame">
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid var(--line)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--surface)', zIndex: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', overflow: 'hidden' }}>
              <h2 style={{ fontSize: '0.875rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName}</h2>
              <Badge variant="sky">
                {agentFlavor === 'claude' && <ClaudeIcon size={12} />}
                {agentFlavor === 'gemini' && <GeminiIcon size={12} />}
                {agentFlavor === 'codex' && <CodexIcon size={12} />}
                {!['claude', 'gemini', 'codex'].includes(agentFlavor) && <Cpu size={12} />}
                {agentFlavor}
              </Badge>
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', flexShrink: 0, marginLeft: '1rem' }}>
              {sessionId.slice(0, 8)}...
            </div>
          </div>

          {runtimeNotice && (
            <BackendNotice message={`백엔드 연결 상태: ${runtimeNotice}`} />
          )}

          <div className="chat-stream-container no-scrollbar" ref={scrollRef}>
            {events.map((event) => {
              const isUser = event.meta?.role === 'user' || event.title === 'User Instruction';

              return (
                <div key={event.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: isUser ? '85%' : '100%', width: isUser ? 'auto' : '100%' }} className="animate-in">
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: isUser ? 'flex-end' : 'flex-start', padding: '0 0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: isUser ? 'var(--primary)' : 'var(--text-muted)' }}>
                      {isUser ? 'YOU' : 'ARIS'}
                    </span>
                    <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>
                      {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>

                  <Card style={{
                    padding: '1rem',
                    backgroundColor: isUser ? 'var(--primary)' : 'var(--surface)',
                    color: isUser ? 'var(--text-on-accent)' : 'var(--text)',
                    borderRadius: isUser ? 'var(--radius-lg) var(--radius-sm) var(--radius-lg) var(--radius-lg)' : 'var(--radius-sm) var(--radius-lg) var(--radius-lg) var(--radius-lg)',
                    border: isUser ? 'none' : '1px solid var(--line)',
                    boxShadow: isUser ? 'var(--shadow-sm)' : 'none'
                  }}>
                    {event.kind === 'text_reply' && <TextReply body={event.body} />}
                    {event.kind === 'command_execution' && <CommandExecution body={event.body} />}
                    {event.kind === 'code_read' && <CodeAction body={event.body} kind="code_read" />}
                    {event.kind === 'code_write' && <CodeAction body={event.body} kind="code_write" />}
                    {event.kind === 'unknown' && <TextReply body={event.body || event.title} />}
                  </Card>
                </div>
              );
            })}
            {isAwaitingReply && (
              <div
                className="animate-in"
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.5rem',
                  alignSelf: 'flex-start',
                  maxWidth: '100%',
                  width: '100%',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0 0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)' }}>ARIS</span>
                  <span style={{ fontSize: '0.625rem', color: 'var(--text-muted)' }}>생성 중...</span>
                </div>
                <Card className="agent-pending-card" role="status" aria-live="polite">
                  <div className="agent-pending-content">
                    <span className="agent-pending-spinner" aria-hidden />
                    <span className="text-sm">응답을 생성하고 있습니다...</span>
                  </div>
                </Card>
              </div>
            )}
          </div>

          {pendingPermissions.length > 0 && (
            <div className="animate-in" style={{ padding: '1rem', background: 'var(--accent-amber-bg)', borderTop: '1px solid var(--accent-amber)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--accent-amber)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <ShieldAlert size={16} /> PENDING PERMISSIONS
              </div>
              {pendingPermissions.map((p) => (
                <div key={p.id} style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <code style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.6)', padding: '0.375rem 0.5rem', borderRadius: '4px', wordBreak: 'break-all' }}>{p.command}</code>
                  <div style={{ display: 'flex', gap: '0.5rem' }}>
                    <Button variant="secondary" onClick={() => decidePermission(p.id, 'deny')} style={{ flex: 1, minHeight: '36px', fontSize: '0.75rem' }}>Deny</Button>
                    <Button onClick={() => decidePermission(p.id, 'allow_once')} style={{ flex: 1, minHeight: '36px', fontSize: '0.75rem', background: 'var(--accent-amber)', color: '#fff', border: 'none' }}>Allow</Button>
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ padding: '1rem', borderTop: '1px solid var(--line)', background: 'var(--surface)', zIndex: 10 }}>
            <form onSubmit={handleSubmit} style={{ position: 'relative' }}>
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                    handleSubmit(e);
                  }
                }}
                placeholder={isOperator ? "명령을 입력하세요... (⌘ + Enter)" : "Viewer 권한입니다."}
                disabled={!isOperator || isSubmitting || isAwaitingReply}
                style={{
                  width: '100%',
                  minHeight: '60px',
                  maxHeight: '150px',
                  padding: '0.75rem 1rem',
                  paddingRight: '4rem',
                  background: 'var(--surface-soft)',
                  border: '1px solid transparent',
                  borderRadius: 'var(--radius-lg)',
                  fontSize: '0.875rem',
                  resize: 'none',
                  outline: 'none',
                  fontFamily: 'inherit',
                  transition: 'border-color 0.2s'
                }}
                onFocus={(e) => e.target.style.borderColor = 'var(--primary)'}
                onBlur={(e) => e.target.style.borderColor = 'transparent'}
              />
              <div style={{ position: 'absolute', bottom: '0.5rem', right: '0.5rem' }}>
                <Button
                  type="submit"
                  disabled={!prompt.trim() || !isOperator || isAwaitingReply}
                  isLoading={isSubmitting || isAwaitingReply}
                  style={{ width: '36px', height: '36px', padding: 0, minHeight: 'auto', borderRadius: 'var(--radius-full)' }}
                  title="Send message"
                >
                  {!isSubmitting && !isAwaitingReply && <Send size={16} />}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>

      <aside className="chat-right-panel">
        <Card className="chat-panel-card">
          <div className="chat-panel-title">런타임 상태</div>
          <div className="chat-runtime-row">
            <span className={`chat-status-dot ${connectionState}`} />
            <span>{connectionState === 'connected' ? '정상 연결' : '응답 지연/연결 확인 필요'}</span>
          </div>
          <div className="chat-panel-meta">대기 승인: {pendingPermissions.length}건</div>
          <div className="chat-panel-meta">이벤트 수: {events.length}</div>
          {runtimeNotice && <div className="chat-runtime-alert">{runtimeNotice}</div>}
        </Card>

        <Card className="chat-panel-card">
          <div className="chat-panel-title">최근 이벤트</div>
          <div className="chat-list-stack">
            {recentEvents.length === 0 && (
              <p className="text-sm text-muted">표시할 이벤트가 없습니다.</p>
            )}
            {recentEvents.map((event) => (
              <div key={event.id} className="chat-mini-log-item">
                <span className="chat-mini-log-time">
                  {new Date(event.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
                <span className="chat-mini-log-text">{event.title || event.kind}</span>
              </div>
            ))}
          </div>
        </Card>
      </aside>
    </div>
  );
}
