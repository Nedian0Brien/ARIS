'use client';

import { useMemo, useState } from 'react';
import type { PermissionDecision, PermissionRequest, SessionAction } from '@/lib/happy/types';

const MODES = ['ask', 'plan', 'execute'] as const;
const INTENT_CHIPS = ['fix', 'refactor', 'debug', 'test', 'deploy'] as const;
const CONSTRAINTS = ['read-only', 'fast', 'safety-first', 'tests-required'] as const;
const SESSION_ACTIONS: SessionAction[] = ['abort', 'retry', 'kill', 'resume'];

type WorkspaceControlPanelProps = {
  sessionId: string;
  isOperator: boolean;
  initialPermissions: PermissionRequest[];
};

type ToastState = {
  tone: 'success' | 'warning' | 'danger';
  message: string;
} | null;

export function WorkspaceControlPanel({ sessionId, isOperator, initialPermissions }: WorkspaceControlPanelProps) {
  const [mode, setMode] = useState<(typeof MODES)[number]>('ask');
  const [intent, setIntent] = useState<string[]>([]);
  const [constraints, setConstraints] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [permissions, setPermissions] = useState(initialPermissions);
  const [loadingAction, setLoadingAction] = useState<SessionAction | null>(null);
  const [loadingPermissionId, setLoadingPermissionId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState>(null);

  const pendingPermissions = useMemo(() => permissions.filter((item) => item.state === 'pending'), [permissions]);
  const highlightedPermission = pendingPermissions[0] ?? null;

  function toggleListValue(list: string[], value: string): string[] {
    if (list.includes(value)) {
      return list.filter((item) => item !== value);
    }
    return [...list, value];
  }

  function emitToast(next: ToastState) {
    setToast(next);
    setTimeout(() => setToast(null), 2800);
  }

  async function onSessionAction(action: SessionAction) {
    if (!isOperator) {
      emitToast({ tone: 'danger', message: 'Operator role is required for session actions.' });
      return;
    }

    setLoadingAction(action);
    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? `Failed to ${action}`);
      }

      const payload = (await response.json()) as { result?: { message?: string } };
      emitToast({ tone: 'success', message: payload.result?.message ?? `${action} requested` });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : `Failed to ${action}`;
      emitToast({ tone: 'danger', message: messageText });
    } finally {
      setLoadingAction(null);
    }
  }

  async function onPermissionDecision(permissionId: string, decision: PermissionDecision) {
    if (!isOperator) {
      emitToast({ tone: 'danger', message: 'Operator role is required for permission decisions.' });
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
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error ?? 'Failed to process permission');
      }

      setPermissions((prev) =>
        prev.map((item) =>
          item.id === permissionId
            ? { ...item, state: decision === 'deny' ? 'denied' : 'approved' }
            : item,
        ),
      );

      const decisionLabel = decision === 'deny' ? 'Denied' : decision === 'allow_session' ? 'Allowed for session' : 'Allowed once';
      emitToast({ tone: decision === 'deny' ? 'warning' : 'success', message: `Permission ${decisionLabel}` });
    } catch (error) {
      const messageText = error instanceof Error ? error.message : 'Failed to process permission';
      emitToast({ tone: 'danger', message: messageText });
    } finally {
      setLoadingPermissionId(null);
    }
  }

  return (
    <section className="workspace-controls">
      {toast ? <div className={`inline-toast ${toast.tone}`}>{toast.message}</div> : null}

      <article className="card intent-composer">
        <div className="panel-title-row">
          <h2>Intent Composer</h2>
          <span className="chip subtle">2-3 interactions target</span>
        </div>

        <div className="chip-row">
          {MODES.map((item) => (
            <button
              key={item}
              className={`chip mode ${mode === item ? 'active' : ''}`}
              type="button"
              onClick={() => setMode(item)}
            >
              {item.toUpperCase()}
            </button>
          ))}
        </div>

        <div className="panel-subtitle">Intent</div>
        <div className="chip-row">
          {INTENT_CHIPS.map((item) => (
            <button
              key={item}
              className={`chip intent ${intent.includes(item) ? 'active' : ''}`}
              type="button"
              onClick={() => setIntent((prev) => toggleListValue(prev, item))}
            >
              {item}
            </button>
          ))}
        </div>

        <div className="panel-subtitle">Constraints</div>
        <div className="chip-row">
          {CONSTRAINTS.map((item) => (
            <button
              key={item}
              className={`chip constraint ${constraints.includes(item) ? 'active' : ''}`}
              type="button"
              onClick={() => setConstraints((prev) => toggleListValue(prev, item))}
            >
              {item}
            </button>
          ))}
        </div>

        <label className="field">
          <span>Instruction</span>
          <textarea
            rows={4}
            placeholder="Describe what you want the agent to do."
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
        </label>

        <div className="intent-preview">
          <span className="muted">Payload preview</span>
          <code>
            {JSON.stringify(
              {
                mode,
                intent,
                constraints,
                message: message.trim(),
              },
              null,
              2,
            )}
          </code>
        </div>
      </article>

      <article className="card">
        <div className="panel-title-row">
          <h2>Session Actions</h2>
          <span className={`chip subtle ${isOperator ? 'ok' : 'locked'}`}>
            {isOperator ? 'Operator access' : 'Viewer read-only'}
          </span>
        </div>

        <div className="action-grid">
          {SESSION_ACTIONS.map((action) => (
            <button
              key={action}
              type="button"
              className={`action-btn ${action}`}
              disabled={!isOperator || loadingAction === action}
              onClick={() => onSessionAction(action)}
            >
              {loadingAction === action ? 'Processing...' : action.toUpperCase()}
            </button>
          ))}
        </div>
      </article>

      <article className="card permission-center">
        <div className="panel-title-row">
          <h2>Permission Center</h2>
          <span className={`chip ${pendingPermissions.length > 0 ? 'warn' : 'ok'}`}>
            {pendingPermissions.length} pending
          </span>
        </div>

        {permissions.length === 0 ? (
          <p className="muted">No pending permission requests.</p>
        ) : (
          <div className="permission-list">
            {permissions.map((item) => (
              <article key={item.id} className={`permission-item ${item.state}`}>
                <div className="permission-header">
                  <div>
                    <strong>{item.command}</strong>
                    <div className="muted">
                      {item.agent} in {item.sessionId}
                    </div>
                  </div>
                  <span className={`chip risk ${item.risk}`}>{item.risk}</span>
                </div>
                <p className="muted">{item.reason}</p>
                <div className="permission-actions">
                  <button
                    type="button"
                    disabled={!isOperator || item.state !== 'pending' || loadingPermissionId === item.id}
                    onClick={() => onPermissionDecision(item.id, 'allow_once')}
                  >
                    Allow once
                  </button>
                  <button
                    type="button"
                    disabled={!isOperator || item.state !== 'pending' || loadingPermissionId === item.id}
                    onClick={() => onPermissionDecision(item.id, 'allow_session')}
                  >
                    Allow session
                  </button>
                  <button
                    type="button"
                    disabled={!isOperator || item.state !== 'pending' || loadingPermissionId === item.id}
                    onClick={() => onPermissionDecision(item.id, 'deny')}
                  >
                    Deny
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </article>

      <div className="mobile-quick-actions" role="region" aria-label="Quick actions">
        <button
          type="button"
          disabled={!highlightedPermission || !isOperator}
          onClick={() => highlightedPermission && onPermissionDecision(highlightedPermission.id, 'allow_once')}
        >
          Approve
        </button>
        <button
          type="button"
          disabled={!highlightedPermission || !isOperator}
          onClick={() => highlightedPermission && onPermissionDecision(highlightedPermission.id, 'deny')}
        >
          Deny
        </button>
        <button type="button" disabled={!isOperator} onClick={() => onSessionAction('abort')}>
          Abort
        </button>
        <button type="button" disabled={!isOperator} onClick={() => onSessionAction('retry')}>
          Retry
        </button>
      </div>
    </section>
  );
}
