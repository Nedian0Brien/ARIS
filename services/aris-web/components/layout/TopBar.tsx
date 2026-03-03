import Link from 'next/link';
import type { AuthenticatedUser } from '@/lib/auth/types';

export function TopBar({ user }: { user: AuthenticatedUser }) {
  return (
    <header className="topbar">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <Link href="/" style={{ fontWeight: 700, fontSize: '1.25rem', letterSpacing: '-0.02em', color: 'var(--text)', textDecoration: 'none' }}>
          ARIS
        </Link>
        <Link href="/" className="muted" style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)', backgroundColor: 'var(--surface-soft)' }}>
          Sessions
        </Link>
        <Link href="/ssh" className="muted" style={{ fontSize: '0.875rem', padding: '0.5rem 0.75rem', borderRadius: 'var(--radius-md)' }}>
          SSH Fallback
        </Link>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
        <span className="muted" style={{ fontSize: '0.875rem' }}>{user.email}</span>
        <span 
          className="chip" 
          style={{ 
            backgroundColor: user.role === 'operator' ? 'var(--emerald-bg)' : 'var(--surface-soft)', 
            color: user.role === 'operator' ? 'var(--emerald-fg)' : 'var(--muted)' 
          }}
        >
          {user.role}
        </span>
        <form action="/api/auth/logout" method="post" style={{ margin: 0 }}>
          <button className="secondary" type="submit" style={{ minHeight: '32px', padding: '0.25rem 0.75rem', fontSize: '0.875rem' }}>
            Logout
          </button>
        </form>
      </div>
    </header>
  );
}
