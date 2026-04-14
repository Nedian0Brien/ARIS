'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Sparkles, LogOut, LayoutDashboard, Terminal, FolderTree, Settings, Sun, Moon, Monitor } from 'lucide-react';
import type { TabType } from './BottomNav';
import { applyTheme, readThemeMode, type ThemeMode } from '@/lib/theme/clientTheme';

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
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const navItems = [
    { id: 'sessions', label: '워크스페이스', icon: LayoutDashboard },
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
    const mode = readThemeMode();
    setThemeMode(mode);
    applyTheme(mode);
  }, []);

  useEffect(() => {
    if (themeMode !== 'system') {
      return;
    }
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const sync = () => {
      applyTheme('system');
    };
    if (typeof media.addEventListener === 'function') {
      media.addEventListener('change', sync);
    } else {
      media.addListener(sync);
    }
    return () => {
      if (typeof media.removeEventListener === 'function') {
        media.removeEventListener('change', sync);
      } else {
        media.removeListener(sync);
      }
    };
  }, [themeMode]);

  const changeThemeMode = (next: ThemeMode) => {
    setThemeMode(next);
    applyTheme(next);
  };

  useEffect(() => {
    if (!autoHideOnScroll) {
      setHiddenOnScroll(false);
      return;
    }

    const scrollContainer = document.querySelector('.app-shell-immersive') as HTMLElement | null;
    const getScrollY = () => {
      const windowScrollY = Math.max(window.scrollY || 0, document.documentElement.scrollTop || 0, document.body.scrollTop || 0);
      const containerScrollY = scrollContainer?.scrollTop ?? 0;
      return Math.max(windowScrollY, containerScrollY);
    };

    const mobileQuery = window.matchMedia('(max-width: 960px)');
    let lastScrollY = getScrollY();
    let scrollRaf: number | null = null;

    const updateVisibility = () => {
      scrollRaf = null;
      const currentY = getScrollY();
      const delta = currentY - lastScrollY;

      if (!mobileQuery.matches || currentY < 8) {
        setHiddenOnScroll(false);
      } else if (delta > 6 && currentY > 48) {
        setHiddenOnScroll(true);
      } else if (delta < -2) {
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
    scrollContainer?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.visualViewport?.addEventListener('scroll', onScroll, { passive: true } as EventListenerOptions);
    window.visualViewport?.addEventListener('resize', onViewportChange, { passive: true } as EventListenerOptions);
    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', onViewportChange);
    } else {
      mobileQuery.addListener(onViewportChange);
    }

    return () => {
      window.removeEventListener('scroll', onScroll);
      scrollContainer?.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onViewportChange);
      window.visualViewport?.removeEventListener('scroll', onScroll);
      window.visualViewport?.removeEventListener('resize', onViewportChange);
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

  useEffect(() => {
    const root = document.documentElement;
    const mobileQuery = window.matchMedia('(max-width: 960px)');

    const syncGlobalHeaderOffset = () => {
      const offset = autoHideOnScroll && mobileQuery.matches && hiddenOnScroll ? '0px' : '64px';
      root.style.setProperty('--global-header-offset', offset);
    };

    syncGlobalHeaderOffset();
    if (typeof mobileQuery.addEventListener === 'function') {
      mobileQuery.addEventListener('change', syncGlobalHeaderOffset);
    } else {
      mobileQuery.addListener(syncGlobalHeaderOffset);
    }

    return () => {
      if (typeof mobileQuery.removeEventListener === 'function') {
        mobileQuery.removeEventListener('change', syncGlobalHeaderOffset);
      } else {
        mobileQuery.removeListener(syncGlobalHeaderOffset);
      }
      root.style.removeProperty('--global-header-offset');
    };
  }, [autoHideOnScroll, hiddenOnScroll]);

  return (
    <header className={`header${autoHideOnScroll ? ' header-autohide' : ''}${hiddenOnScroll ? ' header-hidden-on-scroll' : ''}`}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 800, fontSize: '1.25rem', letterSpacing: '-0.03em', background: 'var(--gradient-primary)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
          <Sparkles size={20} color="var(--primary)" />
          ARIS
        </Link>

        {/* Desktop Navigation */}
        <nav className="flex-desktop header-nav" style={{ display: 'none', alignItems: 'center', gap: '0.5rem', flexWrap: 'nowrap' }}>
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
                  whiteSpace: 'nowrap',
                  fontWeight: 600,
                  color: isActive ? 'var(--primary)' : 'var(--text-muted)',
                  background: isActive ? 'var(--accent-sky-bg)' : 'transparent',
                  transition: 'all 0.2s ease',
                  cursor: 'pointer',
                  flexShrink: 0,
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
        <div
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.2rem',
            border: '1px solid var(--line)',
            borderRadius: '999px',
            background: 'var(--surface-subtle)',
            padding: '0.18rem',
          }}
          aria-label="테마 선택"
        >
          {[
            { mode: 'system' as const, label: '시스템', Icon: Monitor },
            { mode: 'light' as const, label: '라이트', Icon: Sun },
            { mode: 'dark' as const, label: '다크', Icon: Moon },
          ].map(({ mode, label, Icon }) => {
            const active = themeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => changeThemeMode(mode)}
                aria-pressed={active}
                aria-label={`테마 ${label}`}
                title={label}
                style={{
                  width: '30px',
                  height: '30px',
                  border: 0,
                  borderRadius: '999px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: active ? 'var(--primary)' : 'transparent',
                  color: active ? 'var(--text-on-accent)' : 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                <Icon size={15} />
              </button>
            );
          })}
        </div>
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
