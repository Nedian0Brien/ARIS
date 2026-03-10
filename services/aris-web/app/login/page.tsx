'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button, Input, Card } from '@/components/ui';
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from '@/lib/browser/localStorage';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [autoLogin, setAutoLogin] = useState(false);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [show2FA, setShow2FA] = useState(false);
  const [twoFactorMethod, setTwoFactorMethod] = useState<'totp' | 'email'>('totp');
  const [pendingData, setPendingData] = useState<{ userId: string; deviceId: string; rememberMe: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Load remembered email
  useEffect(() => {
    const savedEmail = readLocalStorage('aris_remembered_email');
    if (savedEmail) {
      setEmail(savedEmail);
      setAutoLogin(true);
    }
  }, []);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    // Save or clear email based on auto-login setting
    if (autoLogin) {
      writeLocalStorage('aris_remembered_email', email);
    } else {
      removeLocalStorage('aris_remembered_email');
    }

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe: autoLogin }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? '로그인에 실패했습니다.');
        return;
      }

      if (body.status === '2fa_required') {
        setShow2FA(true);
        setTwoFactorMethod(body.method);
        setPendingData({ userId: body.userId, deviceId: body.deviceId, rememberMe: body.rememberMe ?? false });
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('서버 통신 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify2FA(e: React.FormEvent) {
    e.preventDefault();
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
          rememberMe: pendingData.rememberMe,
        }),
      });

      const body = await response.json();

      if (!response.ok) {
        setError(body.error ?? '인증 코드가 올바르지 않습니다.');
        return;
      }

      router.push('/');
      router.refresh();
    } catch {
      setError('인증 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: 'var(--app-vh, 100vh)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem', backgroundColor: 'var(--surface-subtle)' }}>
      <Card style={{ width: '100%', maxWidth: '400px', padding: '2rem', boxShadow: 'var(--shadow-md)' }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <h1 className="title-lg" style={{ marginBottom: '0.5rem' }}>ARIS</h1>
          <p className="text-muted text-sm">에이전틱 워크스페이스에 오신 것을 환영합니다.</p>
        </div>

        {!show2FA ? (
          <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label className="text-sm" style={{ fontWeight: 600 }}>Email</label>
              <Input 
                type="email" 
                value={email} 
                onChange={(e) => setEmail(e.target.value)} 
                placeholder="email@example.com"
                required 
              />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <label className="text-sm" style={{ fontWeight: 600 }}>Password</label>
              <Input 
                type="password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)} 
                placeholder="••••••••"
                required 
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <input 
                type="checkbox" 
                id="auto-login" 
                checked={autoLogin} 
                onChange={(e) => setAutoLogin(e.target.checked)}
                style={{ width: 'auto', minHeight: 'auto' }}
              />
              <label htmlFor="auto-login" className="text-sm text-muted" style={{ cursor: 'pointer' }}>자동 로그인</label>
            </div>

            {error && <div style={{ color: 'var(--accent-red)', fontSize: '0.875rem' }}>{error}</div>}
            <Button type="submit" isLoading={loading}>Sign In</Button>
          </form>
        ) : (
          <form onSubmit={handleVerify2FA} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }} className="animate-in">
            <div style={{ textAlign: 'center', marginBottom: '1rem' }}>
              <h2 className="title-md">2단계 인증</h2>
              <p className="text-muted text-sm" style={{ marginTop: '0.5rem' }}>
                {twoFactorMethod === 'email' ? '이메일로 발송된 6자리 코드를 입력하세요.' : 'Authenticator 앱의 6자리 코드를 입력하세요.'}
              </p>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <Input 
                type="text" 
                value={twoFactorCode} 
                onChange={(e) => setTwoFactorCode(e.target.value)} 
                placeholder="000000"
                maxLength={6}
                style={{ textAlign: 'center', fontSize: '1.5rem', letterSpacing: '0.5rem', fontWeight: 700 }}
                required 
                autoFocus
              />
            </div>
            {error && <div style={{ color: 'var(--accent-red)', fontSize: '0.875rem', textAlign: 'center' }}>{error}</div>}
            <Button type="submit" isLoading={loading}>Verify</Button>
            <Button variant="secondary" onClick={() => setShow2FA(false)}>취소</Button>
          </form>
        )}
      </Card>
    </div>
  );
}
