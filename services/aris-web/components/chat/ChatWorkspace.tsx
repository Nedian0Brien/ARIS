'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { SessionSummary, UiEvent, SessionAction, PermissionRequest } from '@/lib/happy/types';
import { useSessionEvents } from '@/lib/hooks/useSessionEvents';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { ChatSidebar } from './ChatSidebar';
import { ChatStream } from './ChatStream';
import { ChatComposer } from './ChatComposer';
import { PermissionStrip } from './PermissionStrip';

type Toast = { tone: 'success' | 'warning' | 'danger'; message: string } | null;

export function ChatWorkspace({
  currentSessionId,
  sessions,
  events: initialEvents,
  permissions: initialPermissions,
  isOperator,
  sshCommand,
  sshExpiresAt,
}: {
  currentSessionId: string;
  sessions: SessionSummary[];
  events: UiEvent[];
  permissions: PermissionRequest[];
  isOperator: boolean;
  sshCommand?: string;
  sshExpiresAt?: string;
}) {
  const { events, addEvent } = useSessionEvents(currentSessionId, initialEvents);
  const { pendingPermissions, loadingPermissionId, decidePermission } = usePermissions(currentSessionId, initialPermissions);

  const [toast, setToast] = useState<Toast>(null);
  const [loadingAction, setLoadingAction] = useState<SessionAction | null>(null);
  const [isSubmittingPrompt, setIsSubmittingPrompt] = useState(false);

  function notify(next: Toast) {
    setToast(next);
    setTimeout(() => setToast(null), 3000);
  }

  async function handlePermissionDecide(id: string, decision: 'allow_once' | 'allow_session' | 'deny') {
    if (!isOperator) {
      notify({ tone: 'danger', message: 'Operator role is required.' });
      return;
    }
    const result = await decidePermission(id, decision);
    if (result.success) {
      notify({ tone: decision === 'deny' ? 'warning' : 'success', message: 'Permission processed' });
    } else {
      notify({ tone: 'danger', message: result.error || 'Failed to decide' });
    }
  }

  async function handleAction(action: SessionAction) {
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

  async function handleSubmitPrompt(text: string, mode: string, intents: string[], constraints: string[]) {
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
          meta: { role: 'user', mode, intents, constraints },
        }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'Failed to send instruction');
      }

      const body = (await response.json()) as { event?: UiEvent };
      if (body.event) {
        addEvent(body.event);
      }
    } catch (error) {
      notify({ tone: 'danger', message: error instanceof Error ? error.message : 'Failed to send instruction' });
    } finally {
      setIsSubmittingPrompt(false);
    }
  }

  return (
    <div className="chat-layout">
      <ChatSidebar sessions={sessions} currentSessionId={currentSessionId} />

      <section style={{ display: 'flex', flexDirection: 'column', gap: '1rem', minWidth: 0 }}>
        <article className="card" style={{ padding: '1rem 1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: '1.125rem' }}>Agentic Workspace</h2>
            <p className="muted" style={{ margin: '0.25rem 0 0', fontSize: '0.875rem' }}>
              Messaging-first runtime interface.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <span className="chip" style={{ backgroundColor: isOperator ? 'var(--emerald-bg)' : 'var(--surface-soft)', color: isOperator ? 'var(--emerald-fg)' : 'var(--muted)' }}>
              {isOperator ? 'Operator' : 'Viewer'}
            </span>
            <Link href="/ssh" className="chip solid">
              SSH Fallback
            </Link>
          </div>
        </article>

        {toast ? (
          <div className={`inline-toast ${toast.tone}`}>
            {toast.message}
          </div>
        ) : null}

        {sshCommand ? (
          <article className="card animate-slide-up" style={{ borderColor: '#bfdbfe', backgroundColor: '#eff6ff' }}>
            <strong style={{ color: '#1e3a8a', fontSize: '0.875rem' }}>SSH Fallback Command Issued</strong>
            <pre style={{ margin: '0.5rem 0 0', whiteSpace: 'pre-wrap', wordBreak: 'break-all', fontSize: '0.8125rem', fontFamily: 'var(--font-mono)' }}>{sshCommand}</pre>
            <p className="muted" style={{ margin: '0.5rem 0 0', fontSize: '0.75rem' }}>
              Expires: {sshExpiresAt ? new Date(sshExpiresAt).toLocaleString() : 'unknown'}
            </p>
          </article>
        ) : null}

        <PermissionStrip
          pendingPermissions={pendingPermissions}
          onDecide={handlePermissionDecide}
          disabled={!isOperator || loadingPermissionId !== null}
        />

        <div className="card" style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: 0, overflow: 'hidden', border: 'none', boxShadow: 'none', background: 'transparent' }}>
          <ChatStream events={events} />
          
          <ChatComposer
            onSubmit={handleSubmitPrompt}
            onAction={handleAction}
            disabled={!isOperator}
            isSubmitting={isSubmittingPrompt}
            loadingAction={loadingAction}
          />
        </div>
      </section>
    </div>
  );
}
