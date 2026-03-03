'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SessionSummary } from '@/lib/happy/types';

export function CreateSessionForm({ isOperator }: { isOperator: boolean }) {
  const [path, setPath] = useState('');
  const [agent, setAgent] = useState<SessionSummary['agent']>('claude');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isOperator) return;

    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/runtime/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, agent }),
      });

      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error ?? 'Failed to create session');
      }

      const { session } = await response.json();
      router.push(`/sessions/${encodeURIComponent(session.id)}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong');
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="card animate-slide-up" style={{ maxWidth: '600px', width: '100%' }}>
      <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem' }}>Create New Session</h2>
      <form onSubmit={onSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="field">
          <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Start Location (Path)</label>
          <input
            type="text"
            placeholder="/home/ubuntu/project/my-app"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            required
            disabled={!isOperator || loading}
          />
          <p className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
            Note: Path should be within the mapped host projects root.
          </p>
        </div>
        <div className="field">
          <label style={{ fontSize: '0.875rem', fontWeight: 600 }}>Choose Agent</label>
          <select
            value={agent}
            onChange={(e) => setAgent(e.target.value as SessionSummary['agent'])}
            disabled={!isOperator || loading}
            style={{ 
              padding: '0.75rem', 
              borderRadius: 'var(--radius-md)', 
              border: '1px solid var(--line)',
              backgroundColor: 'var(--surface)'
            }}
          >
            <option value="claude">Claude (Recommended)</option>
            <option value="gemini">Gemini</option>
            <option value="codex">Codex</option>
          </select>
        </div>
        {error && (
          <div style={{ color: '#b91c1c', fontSize: '0.875rem', padding: '0.5rem', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-sm)' }}>
            {error}
          </div>
        )}
        <button type="submit" className="primary" disabled={!isOperator || loading || !path}>
          {loading ? 'Creating...' : 'Start Session'}
        </button>
        {!isOperator && (
          <p className="muted" style={{ fontSize: '0.75rem', textAlign: 'center' }}>
            Only operators can create new sessions.
          </p>
        )}
      </form>
    </article>
  );
}
