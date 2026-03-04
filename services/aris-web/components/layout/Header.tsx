'use client';

import Link from 'next/link';
import { Button } from '@/components/ui';
import { Sparkles, LogOut } from 'lucide-react';

export function Header({ userEmail, role }: { userEmail: string; role: string }) {
  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.03em', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          <Sparkles size={20} color="var(--primary)" />
          ARIS
        </Link>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ textAlign: 'right', display: 'none' }} className="md:block">
          <div className="text-sm" style={{ fontWeight: 600 }}>{userEmail}</div>
          <div className="text-sm text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>{role}</div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <Button variant="ghost" style={{ padding: '0.5rem', minHeight: 'auto', color: 'var(--text-muted)' }} title="Logout">
            <LogOut size={20} />
          </Button>
        </form>
      </div>
      <style jsx>{`
        @media (min-width: 768px) {
          .md\\:block { display: block !important; }
        }
      `}</style>
    </header>
  );
}
