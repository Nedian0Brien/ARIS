'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui';
import { Sparkles, LogOut, LayoutDashboard, Terminal, FolderTree, Settings } from 'lucide-react';
import type { TabType } from './BottomNav';

interface HeaderProps {
  userEmail: string;
  role: string;
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
}

export function Header({ userEmail, role, activeTab, onTabChange }: HeaderProps) {
  const router = useRouter();
  const navItems = [
    { id: 'sessions', label: '세션', icon: LayoutDashboard },
    { id: 'console', label: '콘솔', icon: Terminal },
    { id: 'files', label: '파일', icon: FolderTree },
    { id: 'settings', label: '설정', icon: Settings },
  ];

  const handleNavClick = (id: TabType) => {
    if (onTabChange) {
      onTabChange(id);
    } else {
      router.push(`/?tab=${id}`);
    }
  };

  return (
    <header className="header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.03em', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          <Sparkles size={20} color="var(--primary)" />
          ARIS
        </Link>

        {/* Desktop Navigation */}
        <nav className="flex-desktop" style={{ display: 'none', alignItems: 'center', gap: '0.5rem' }}>
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            
            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id as TabType)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  padding: '0.5rem 0.75rem',
                  borderRadius: 'var(--radius-md)',
                  fontSize: '0.875rem',
                  fontWeight: 600,
                  color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                  background: isActive ? 'var(--accent-sky-bg)' : 'transparent',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer'
                }}
                className="nav-btn"
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ textAlign: 'right', display: 'none' }} className="block-desktop">
          <div className="text-sm" style={{ fontWeight: 600 }}>{userEmail}</div>
          <div className="text-sm text-muted" style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>{role}</div>
        </div>
        <form action="/api/auth/logout" method="POST">
          <Button variant="ghost" style={{ padding: '0.5rem', minHeight: 'auto', color: 'var(--text-muted)' }} title="Logout">
            <LogOut size={20} />
          </Button>
        </form>
      </div>
    </header>
  );
}
