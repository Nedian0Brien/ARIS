'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';

export function Header({ userEmail, role }: { userEmail: string; role: string }) {
  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem' }}>
        <Link href="/" style={{ fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.03em' }}>
          ARIS
        </Link>
        <nav style={{ display: 'flex', gap: '1rem' }}>
          <Link href="/" className="text-sm text-muted" style={{ fontWeight: 500 }}>Dashboard</Link>
        </nav>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ textAlign: 'right' }}>
          <div className="text-sm" style={{ fontWeight: 600 }}>{userEmail}</div>
          <div className="text-sm text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>{role}</div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <Button variant="secondary" style={{ minHeight: '36px', fontSize: '0.875rem' }}>
            Logout
          </Button>
        </form>
      </div>
    </header>
  );
}
