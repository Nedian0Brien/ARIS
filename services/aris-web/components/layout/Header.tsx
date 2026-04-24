'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { Sparkles, LogOut, FolderTree, Home, MessageSquareText, Moon, Monitor, PanelsTopLeft, Sun } from 'lucide-react';
import type { TabType } from './BottomNav';
import { applyTheme, readThemeMode, type ThemeMode } from '@/lib/theme/clientTheme';
import { hasAppBasePath, withAppBasePath } from '@/lib/routing/appPath';
import { primeAutoHideScrollState, reduceAutoHideScrollState } from './mobileScrollAutoHide';
import { useSessionScrollOrchestrator } from '@/app/sessions/[sessionId]/useSessionScrollOrchestrator';

interface HeaderProps {
  userEmail: string;
  role: string;
  activeTab?: TabType;
  onTabChange?: (tab: TabType) => void;
  autoHideOnScroll?: boolean;
}

const AUTO_HIDE_RESUME_GUARD_MS = 240;
const HEADER_AUTO_HIDE_THRESHOLDS = {
  nearTopThreshold: 8,
  hideAfterScrollY: 48,
  hideDeltaThreshold: 6,
  revealDeltaThreshold: 2,
} as const;

export function Header({ userEmail, role, activeTab, onTabChange, autoHideOnScroll = false }: HeaderProps) {
  const router = useRouter();
  const [hiddenOnScroll, setHiddenOnScroll] = useState(false);
  const [themeMode, setThemeMode] = useState<ThemeMode>('system');
  const { isActive: isSessionScrollActive, phase: sessionScrollPhase } = useSessionScrollOrchestrator();
  const navItems = [
    { id: 'home', label: 'Home', icon: Home },
    { id: 'ask', label: 'Ask ARIS', icon: MessageSquareText },
    { id: 'project', label: 'Project', icon: PanelsTopLeft },
    { id: 'files', label: 'Files', icon: FolderTree },
  ];

  const handleNavClick = (id: TabType) => {
    if (onTabChange) {
      onTabChange(id);
    } else {
      const destination = withAppBasePath(`/?tab=${id}`);
      if (hasAppBasePath()) {
        window.location.assign(destination);
        return;
      }
      router.push(destination);
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
    let scrollRaf: number | null = null;
    let autoHideState = primeAutoHideScrollState({
      currentY: getScrollY(),
      now: Date.now(),
      resumeGuardMs: AUTO_HIDE_RESUME_GUARD_MS,
    });

    const syncHidden = (nextHidden: boolean) => {
      setHiddenOnScroll((previous) => (previous === nextHidden ? previous : nextHidden));
    };

    const resetAutoHideBaseline = (reveal = false) => {
      const currentY = getScrollY();
      autoHideState = reveal
        ? primeAutoHideScrollState({
            currentY,
            now: Date.now(),
            resumeGuardMs: AUTO_HIDE_RESUME_GUARD_MS,
          })
        : {
            ...autoHideState,
            hidden: mobileQuery.matches ? autoHideState.hidden : false,
            lastScrollY: currentY,
            resumeGuardUntil: 0,
          };
      syncHidden(autoHideState.hidden);
    };

    const updateVisibility = () => {
      scrollRaf = null;
      autoHideState = reduceAutoHideScrollState({
        state: autoHideState,
        currentY: getScrollY(),
        now: Date.now(),
        isMobile: mobileQuery.matches,
        thresholds: HEADER_AUTO_HIDE_THRESHOLDS,
        isSessionScrollActive,
        sessionScrollPhase,
      });
      syncHidden(autoHideState.hidden);
    };

    const onScroll = () => {
      if (scrollRaf !== null) return;
      scrollRaf = window.requestAnimationFrame(updateVisibility);
    };

    const onViewportChange = () => {
      if (scrollRaf !== null) {
        window.cancelAnimationFrame(scrollRaf);
        scrollRaf = null;
      }
      resetAutoHideBaseline(false);
    };

    const onResume = () => {
      if (document.visibilityState === 'hidden') {
        return;
      }
      if (scrollRaf !== null) {
        window.cancelAnimationFrame(scrollRaf);
        scrollRaf = null;
      }
      resetAutoHideBaseline(true);
    };

    syncHidden(autoHideState.hidden);

    window.addEventListener('scroll', onScroll, { passive: true });
    scrollContainer?.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onViewportChange, { passive: true });
    window.visualViewport?.addEventListener('scroll', onScroll, { passive: true } as EventListenerOptions);
    window.visualViewport?.addEventListener('resize', onViewportChange, { passive: true } as EventListenerOptions);
    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    document.addEventListener('visibilitychange', onResume);
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
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      document.removeEventListener('visibilitychange', onResume);
      if (typeof mobileQuery.removeEventListener === 'function') {
        mobileQuery.removeEventListener('change', onViewportChange);
      } else {
        mobileQuery.removeListener(onViewportChange);
      }
      if (scrollRaf !== null) {
        window.cancelAnimationFrame(scrollRaf);
      }
    };
  }, [activeTab, autoHideOnScroll, isSessionScrollActive, sessionScrollPhase]);

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
        <a href={withAppBasePath('/')} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, fontSize: '0.95rem', letterSpacing: 'var(--ls-snug)', color: 'var(--text-primary)' }}>
          <Sparkles size={20} color="var(--primary)" />
          ARIS
        </a>

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
                  borderRadius: 'var(--r-sm)',
                  fontSize: 'var(--text-sm)',
                  whiteSpace: 'nowrap',
                  fontWeight: 500,
                  color: isActive ? 'var(--b-700)' : 'var(--text-secondary)',
                  background: isActive ? 'var(--b-50)' : 'transparent',
                  transition: 'background-color var(--dur-fast) var(--ease-smooth), color var(--dur-fast) var(--ease-smooth)',
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
            border: '1px solid var(--border-default)',
            borderRadius: '999px',
            background: 'var(--surface-sunken)',
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
                  background: active ? 'var(--b-600)' : 'transparent',
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
        <form action={withAppBasePath('/api/auth/logout')} method="POST">
          <Button variant="ghost" style={{ padding: '0.5rem', minHeight: 'auto', color: 'var(--text-muted)' }} title="Logout">
            <LogOut size={20} />
          </Button>
        </form>
      </div>
    </header>
  );
}
