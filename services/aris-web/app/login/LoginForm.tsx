'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? 'Login failed');
        return;
      }

      router.push(nextPath);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="form">
      <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>ARIS</div>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Secure Runtime Access</h1>
        <p className="muted" style={{ fontSize: '0.875rem' }}>Operator and viewer login for cross-device agentic coding sessions.</p>
      </div>

      <form onSubmit={onSubmit}>
        <label className="field">
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
        </label>

        <label className="field">
          <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>Password</span>
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            type="password"
            autoComplete="current-password"
            required
          />
        </label>

        {error ? <p style={{ color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-sm)' }}>{error}</p> : null}

        <button className="primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
          {loading ? 'Signing in...' : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
