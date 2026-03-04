'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<'totp' | 'email'>('totp');
  const [pendingData, setPendingData] = useState<{ userId: string; deviceId: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function onLoginSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? 'Login failed');
        return;
      }

      if (body.status === '2fa_required') {
        setShow2FA(true);
        setTwoFactorMethod(body.method);
        setPendingData({ userId: body.userId, deviceId: body.deviceId });
        return;
      }

      router.push(nextPath);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function on2FASubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!pendingData) return;

    setError(null);
    setLoading(true);

    try {
      const response = await fetch('/api/auth/verify-2fa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: pendingData.userId,
          deviceId: pendingData.deviceId,
          code: twoFactorCode,
          method: twoFactorMethod,
        }),
      });

      const body = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(body.error ?? 'Verification failed');
        return;
      }

      router.push(nextPath);
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  if (show2FA) {
    const isEmail = twoFactorMethod === 'email';
    return (
      <div className="form animate-slide-up">
        <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>Security Verification</div>
          <h1 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Enter Verification Code</h1>
          <p className="muted" style={{ fontSize: '0.875rem' }}>
            {isEmail 
              ? 'We sent a 6-digit code to your email address. Please check your inbox (and spam folder).' 
              : 'This is an untrusted device. Please enter the 6-digit code from your authenticator app.'}
          </p>
        </div>

        <form onSubmit={on2FASubmit}>
          <label className="field">
            <span style={{ fontSize: '0.875rem', fontWeight: 500 }}>{isEmail ? 'Email Code' : 'OTP Code'}</span>
            <input
              value={twoFactorCode}
              onChange={(e) => setTwoFactorCode(e.target.value)}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="one-time-code"
              placeholder="000000"
              maxLength={6}
              required
              autoFocus
            />
          </label>

          {error ? <p style={{ color: '#b91c1c', fontSize: '0.875rem', marginBottom: '1rem', padding: '0.5rem', backgroundColor: '#fee2e2', borderRadius: 'var(--radius-sm)' }}>{error}</p> : null}

          <button className="primary" type="submit" disabled={loading} style={{ width: '100%', marginTop: '0.5rem' }}>
            {loading ? 'Verifying...' : 'Verify & Continue'}
          </button>
          
          <button 
            type="button" 
            onClick={() => setShow2FA(false)} 
            className="secondary" 
            style={{ width: '100%', marginTop: '0.5rem', border: 'none', background: 'none', color: 'var(--muted)', minHeight: 'auto' }}
          >
            Back to login
          </button>
        </form>
      </div>
    );
  }

  return (
    <div className="form">
      <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
        <div style={{ fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.02em', marginBottom: '0.5rem' }}>ARIS</div>
        <h1 style={{ fontSize: '1.25rem', marginBottom: '0.25rem' }}>Secure Runtime Access</h1>
        <p className="muted" style={{ fontSize: '0.875rem' }}>Operator and viewer login for cross-device agentic coding sessions.</p>
      </div>

      <form onSubmit={onLoginSubmit}>
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
