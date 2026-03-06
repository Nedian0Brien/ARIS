'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Sparkles, LogOut, LayoutDashboard, Terminal, FolderTree, Settings } from 'lucide-react';
import type { TabType } from './BottomNav';

interface HeaderProps {
  userEmail: string;
  role: string;
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
  autoHideOnScroll?: boolean;
}

export function Header({ userEmail, role, activeTab, onTabChange, autoHideOnScroll = false }: HeaderProps) {
  const router = useRouter();
  const [hiddenOnScroll, setHiddenOnScroll] = useState(false);
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

  useEffect(() => {
    if (!autoHideOnScroll) {
      setHiddenOnScroll(false);
      return;
    }

    const getScrollY = () =>
      Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);

    const mobileQuery = window.matchMedia('(max-width: 960px)');
    let lastScrollY = getScrollY();
    let scrollRaf: number | null = null;

    const updateVisibility = () => {
      scrollRaf = null;
      const currentY = getScrollY();
      const delta = currentY - lastScrollY;
      const movementThreshold = 8;

      if (!mobileQuery.matches || currentY < 24) {
        setHiddenOnScroll(false);
      } else if (delta > movementThreshold && currentY > 72) {
        setHiddenOnScroll(true);
      } else if (delta < -movementThreshold) {
        setHiddenOnScroll(false);
      }

      lastScrollY = currentY;
    };

    const onScroll = () => {
      if (scrollRaf !== null) return;
      scrollRaf = window.requestAnimationFrame(updateVisibility);
    };

    const onViewportChange = () => {
      if (!mobileQuery.matches) {
        setHiddenOnScroll(false);
      }
      lastScrollY = getScrollY();
    };

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', onViewportChange);
    } else {
      mobileQuery.addListener(onViewportChange);
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onViewportChange);
      if (typeof mobileQuery.removeEventListener === 'function') {
        mobileQuery.removeEventListener('change', onViewportChange);
      } else {
        mobileQuery.removeListener(onViewportChange);
      }
      if (scrollRaf !== null) {
        window.cancelAnimationFrame(scrollRaf);
      }
    };
  }, [autoHideOnScroll]);

  return (
    <header className={`header${autoHideOnScroll ? ' header-autohide' : ''}${hiddenOnScroll ? ' header-hidden-on-scroll' : ''}`}>
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
