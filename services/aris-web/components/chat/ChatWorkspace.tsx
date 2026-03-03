'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  PermissionDecision,
  PermissionRequest,
  SessionAction,
  SessionSummary,
  UiEvent,
} from '@/lib/happy/types';

const MODES = ['ask', 'plan', 'execute'] as const;
const INTENTS = ['fix', 'refactor', 'debug', 'test', 'ship'] as const;
const CONSTRAINTS = ['safe', 'fast', 'tests-required', 'minimal-diff'] as const;
const SESSION_ACTIONS: SessionAction[] = ['abort', 'retry', 'kill', 'resume'];

type Toast = { tone: 'success' | 'warning' | 'danger'; message: string } | null;
type Actor = 'user' | 'agent' | 'system';

type ChatWorkspaceProps = {
  currentSessionId: string;
  sessions: SessionSummary[];
  events: UiEvent[];
  permissions: PermissionRequest[];
  isOperator: boolean;
  sshCommand?: string;
  sshExpiresAt?: string;
};

function kindLabel(kind: UiEvent['kind']): string {
  if (kind === 'text_reply') return 'Text';
  if (kind === 'command_execution') return 'Command';
  if (kind === 'code_read') return 'Code Read';
  if (kind === 'code_write') return 'Code Write';
  return 'Unknown';
}

function listToggle(list: string[], value: string): string[] {
  if (list.includes(value)) {
    return list.filter((item) => item !== value);
  }
  return [...list, value];
}

function parseEventActor(event: UiEvent): Actor {
  const roleRaw = event.meta?.role;
  if (roleRaw === 'user' || roleRaw === 'agent' || roleRaw === 'system') {
    return roleRaw;
  }

  if (event.meta?.system === true) {
    return 'system';
  }

  if (event.title.toLowerCase().includes('user instruction')) {
    return 'user';
  }

  return 'agent';
}

function mergeEvents(events: UiEvent[]): UiEvent[] {
  const dedup = new Map<string, UiEvent>();
  for (const event of events) {
    dedup.set(event.id, event);
  }

  return [...dedup.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function ChatWorkspace({
  currentSessionId,
  sessions,
  events,
  permissions: initialPermissions,
  isOperator,
  sshCommand,
  sshExpiresAt,
}: ChatWorkspaceProps) {
  const [mode, setMode] = useState<(typeof MODES)[number]>('ask');
  const [intents, setIntents] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [prompt, setPrompt] = useState('');
  const [permissions, setPermissions] = useState(initialPermissions);
  const [streamEvents, setStreamEvents] = useState(events);
  const [loadingAction, setLoadingAction] = useState<SessionAction | null>(null);
  const [loadingPermissionId, setLoadingPermissionId] = useState<string | null>(null);
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const streamBottomRef = useRef<HTMLDivElement | null>(null);

  const pendingPermissions = useMemo(
    () => permissions.filter((item) => item.state === 'pending'),
    [permissions],
  );

  function notify(next: Toast) {
    setToast(next);
    setTimeout(() => setToast(null), 2500);
  }

  useEffect(() => {
    setPermissions(initialPermissions);
  }, [currentSessionId, initialPermissions]);

  useEffect(() => {
    setStreamEvents(events);
  }, [currentSessionId, events]);

  useEffect(() => {
    streamBottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [streamEvents, pendingPermissions.length]);

  useEffect(() => {
    let aborted = false;

    async function refreshEvents() {
      try {
        const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(currentSessionId)}/events`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as { events?: UiEvent[] };
        const freshEvents = body.events;
        if (!aborted && Array.isArray(freshEvents)) {
          setStreamEvents((prev) => mergeEvents([...prev, ...freshEvents]));
        }
      } catch {
        // Polling failure is non-fatal; next cycle can recover.
      }
    }

    refreshEvents();
    const timer = setInterval(refreshEvents, 5000);

    return () => {
      aborted = true;
      clearInterval(timer);
    };
  }, [currentSessionId]);

  async function runAction(action: SessionAction) {
    if (!isOperator) {
      notify({ tone: 'danger', message: 'Operator role is required.' });
      return;
    }

    setLoadingAction(action);
    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(currentSessionId)}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Failed to ${action}`);
      }

      notify({ tone: 'success', message: `${action.toUpperCase()} sent` });
    } catch (error) {
      notify({ tone: 'danger', message: error instanceof Error ? error.message : `Failed to ${action}` });
    } finally {
      setLoadingAction(null);
    }
  }

  async function decidePermission(permissionId: string, decision: PermissionDecision) {
    if (!isOperator) {
      notify({ tone: 'danger', message: 'Operator role is required.' });
      return;
    }

    setLoadingPermissionId(permissionId);
    try {
      const response = await fetch('/api/runtime/permissions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ permissionId, decision }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to decide permission');
      }

      setPermissions((prev) =>
        prev.map((item) =>
          item.id === permissionId
            ? { ...item, state: decision === 'deny' ? 'denied' : 'approved' }
            : item,
        ),
      );
      notify({ tone: decision === 'deny' ? 'warning' : 'success', message: 'Permission processed' });
    } catch (error) {
      notify({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Failed to decide permission',
      });
    } finally {
      setLoadingPermissionId(null);
    }
  }

  async function submitPrompt() {
    const text = prompt.trim();
    if (!text) {
      notify({ tone: 'warning', message: 'Write an instruction first.' });
      return;
    }

    if (!isOperator) {
      notify({ tone: 'danger', message: 'Operator role is required.' });
      return;
    }

    setIsSubmittingPrompt(true);
    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(currentSessionId)}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'message',
          title: 'User Instruction',
          text,
          meta: {
            role: 'user',
            mode,
            intents,
            constraints,
          },
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to send instruction');
      }

      const body = (await response.json()) as { event?: UiEvent };
      if (body.event) {
        setStreamEvents((prev) => mergeEvents([...prev, body.event!]));
      }

      notify({ tone: 'success', message: `Instruction sent (${mode.toUpperCase()})` });
      setPrompt('');
    } catch (error) {
      notify({
        tone: 'danger',
        message: error instanceof Error ? error.message : 'Failed to send instruction',
      });
    } finally {
      setIsSubmittingPrompt(false);
    }
  }

  return (
    <div className="chat-layout">
      <aside className="chat-sidebar card">
        <div className="panel-title-row">
          <h2>Sessions</h2>
          <span className="chip subtle">{sessions.length}</span>
        </div>
        <div className="chat-session-list">
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/?session=${encodeURIComponent(session.id)}`}
              className={`chat-session-item ${session.id === currentSessionId ? 'active' : ''}`}
            >
              <div className="chat-session-title">{session.projectName}</div>
              <div className="muted" style={{ fontSize: '0.8rem' }}>
                {session.agent} • {session.status}
              </div>
            </Link>
          ))}
        </div>
      </aside>

      <section className="chat-main">
        <article className="card chat-head">
          <div className="panel-title-row">
            <h2>Agentic Chat Workspace</h2>
            <div className="row">
              <span className={`chip ${isOperator ? 'ok' : 'subtle'}`}>{isOperator ? 'Operator' : 'Viewer'}</span>
              <Link href="/ssh" className="chip subtle">
                SSH fallback
              </Link>
            </div>
          </div>
          <p className="muted" style={{ margin: 0 }}>
            Messaging-first runtime interface for coding tasks.
          </p>
        </article>

        {toast ? <div className={`inline-toast ${toast.tone}`}>{toast.message}</div> : null}

        {sshCommand ? (
          <article className="card ssh-issued">
            <strong>SSH fallback command issued</strong>
            <pre style={{ margin: '0.45rem 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{sshCommand}</pre>
            <p className="muted" style={{ margin: '0.35rem 0 0' }}>
              Expires: {sshExpiresAt ? new Date(sshExpiresAt).toLocaleString() : 'unknown'}
            </p>
          </article>
        ) : null}

        <section className="chat-stream card" aria-live="polite">
          {streamEvents.map((event) => {
            const actor = parseEventActor(event);
            return (
              <article key={event.id} className={`chat-bubble ${event.kind} ${actor}`}>
                <div className="chat-bubble-head">
                  <div className="chat-head-left">
                    <span className={`chip actor ${actor}`}>{actor}</span>
                    <span className={`chip kind ${event.kind}`}>{kindLabel(event.kind)}</span>
                  </div>
                  <span className="muted chat-bubble-time">{new Date(event.timestamp).toLocaleString()}</span>
                </div>
                <p className="chat-bubble-title">{event.title}</p>
                <pre>{event.body || '(empty)'}</pre>
              </article>
            );
          })}
          <div ref={streamBottomRef} />
        </section>

        {pendingPermissions.length > 0 ? (
          <section className="card chat-permission-strip">
            <div className="panel-title-row">
              <h2>Pending Permissions</h2>
              <span className="chip warn">{pendingPermissions.length}</span>
            </div>
            <div className="permission-strip-list">
              {pendingPermissions.map((item) => (
                <article key={item.id} className="permission-strip-item">
                  <div>
                    <strong>{item.command}</strong>
                    <div className="muted">{item.reason}</div>
                  </div>
                  <div className="permission-strip-actions">
                    <button
                      type="button"
                      disabled={!isOperator || loadingPermissionId === item.id}
                      onClick={() => decidePermission(item.id, 'allow_once')}
                    >
                      Allow once
                    </button>
                    <button
                      type="button"
                      disabled={!isOperator || loadingPermissionId === item.id}
                      onClick={() => decidePermission(item.id, 'allow_session')}
                    >
                      Allow session
                    </button>
                    <button
                      type="button"
                      disabled={!isOperator || loadingPermissionId === item.id}
                      onClick={() => decidePermission(item.id, 'deny')}
                    >
                      Deny
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        <section className="card chat-composer">
          <div className="composer-row">
            {MODES.map((item) => (
              <button
                key={item}
                type="button"
                className={`chip mode ${mode === item ? 'active' : ''}`}
                onClick={() => setMode(item)}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>

          <div className="composer-row">
            {INTENTS.map((item) => (
              <button
                key={item}
                type="button"
                className={`chip intent ${intents.includes(item) ? 'active' : ''}`}
                onClick={() => setIntents((prev) => listToggle(prev, item))}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="composer-row">
            {CONSTRAINTS.map((item) => (
              <button
                key={item}
                type="button"
                className={`chip constraint ${constraints.includes(item) ? 'active' : ''}`}
                onClick={() => setConstraints((prev) => listToggle(prev, item))}
              >
                {item}
              </button>
            ))}
          </div>

          <textarea
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe your coding intent..."
            rows={4}
          />

          <div className="composer-actions">
            <button className="primary" type="button" onClick={submitPrompt} disabled={!isOperator || isSubmittingPrompt}>
              {isSubmittingPrompt ? 'Sending...' : 'Send to Agent'}
            </button>
            {SESSION_ACTIONS.map((action) => (
              <button
                key={action}
                type="button"
                className={`action-btn ${action}`}
                disabled={!isOperator || loadingAction === action}
                onClick={() => runAction(action)}
              >
                {loadingAction === action ? '...' : action.toUpperCase()}
              </button>
            ))}
          </div>

          {isOperator ? (
            <div className="row" style={{ gap: '0.6rem', flexWrap: 'wrap' }}>
              <form action="/api/ssh/link" method="post" className="row">
                <input type="hidden" name="sessionId" value={currentSessionId} />
                <input type="hidden" name="reason" value="chat-ui-fallback" />
                <input type="hidden" name="accessOption" value="guided_link" />
                <button className="secondary" type="submit">
                  Issue SSH fallback link
                </button>
              </form>
              <span className="muted" style={{ fontSize: '0.78rem' }}>
                Use only when UI interaction cannot cover the task.
              </span>
            </div>
          ) : null}
        </section>
      </section>
    </div>
  );
}
