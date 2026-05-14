'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, LogOut, MoreHorizontal, Monitor, Moon, Settings, Sun, UserCog } from 'lucide-react';
import { withAppBasePath } from '@/lib/routing/appPath';
import type { ThemeMode } from '@/lib/theme/clientTheme';
import styles from './SidebarFooterMenu.module.css';

interface Props {
  user: { email: string; role: string };
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onOpenSettings: () => void;
}

type ActivePopover = 'account' | 'context' | null;

const THEME_ITEMS: Array<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: 'light', label: '라이트', Icon: Sun },
  { mode: 'dark', label: '다크', Icon: Moon },
  { mode: 'system', label: '시스템', Icon: Monitor },
];

export function SidebarFooterMenu({ user, themeMode, onThemeChange, onOpenSettings }: Props) {
  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const userInitial = (user.email?.trim()?.[0] ?? 'A').toUpperCase();
  const accountName = user.email.split('@')[0] || 'ARIS';

  useEffect(() => {
    if (activePopover === null) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setActivePopover(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setActivePopover(null);
    };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [activePopover]);

  const toggle = (next: 'account' | 'context') => {
    setActivePopover((current) => (current === next ? null : next));
  };

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.row}>
        <button
          type="button"
          className={styles.accountTrigger}
          aria-haspopup="menu"
          aria-expanded={activePopover === 'account'}
          aria-controls="sidebar-footer-account-panel"
          onClick={() => toggle('account')}
        >
          <span className={styles.avatar}>{userInitial}</span>
          <span className={styles.identity}>
            <span className={styles.name}>{accountName}</span>
            <span className={styles.meta}>{user.role}</span>
          </span>
        </button>
        <button
          type="button"
          className={styles.contextTrigger}
          aria-label="환경 메뉴"
          aria-haspopup="menu"
          aria-expanded={activePopover === 'context'}
          aria-controls="sidebar-footer-context-panel"
          onClick={() => toggle('context')}
        >
          <MoreHorizontal size={16} aria-hidden />
        </button>
      </div>

      {activePopover === 'account' && (
        <div
          id="sidebar-footer-account-panel"
          className={`${styles.panel} ${styles.accountPanel}`}
          role="menu"
          aria-label="계정 메뉴"
        >
          <div className={styles.sectionLabel}>Account List</div>
          <div className={styles.accountRow} role="presentation">
            <span className={styles.avatarSmall} aria-hidden>{userInitial}</span>
            <span className={styles.accountInfo}>
              <span className={styles.accountEmail}>{user.email}</span>
              <span className={styles.accountRole}>{user.role}</span>
            </span>
            <Check size={14} className={styles.accountCheck} aria-label="현재 계정" />
          </div>
          <div className={styles.divider} role="presentation" />
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => { setActivePopover(null); onOpenSettings(); }}
          >
            <UserCog size={14} aria-hidden /> Account Settings
          </button>
          <div className={styles.divider} role="presentation" />
          <form action={withAppBasePath('/api/auth/logout')} method="POST" className={styles.signoutForm}>
            <button type="submit" role="menuitem" className={`${styles.item} ${styles.signout}`}>
              <LogOut size={14} aria-hidden /> Sign Out
            </button>
          </form>
        </div>
      )}

      {activePopover === 'context' && (
        <div
          id="sidebar-footer-context-panel"
          className={`${styles.panel} ${styles.contextPanel}`}
          role="menu"
          aria-label="환경 메뉴"
        >
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => { setActivePopover(null); onOpenSettings(); }}
          >
            <Settings size={14} aria-hidden /> Settings
          </button>
          <div className={styles.section} role="group" aria-label="테마">
            <div className={styles.sectionLabel}>테마</div>
            <div className={styles.themeColumn}>
              {THEME_ITEMS.map(({ mode, label, Icon }) => {
                const active = themeMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`${styles.themeRow} ${active ? styles.themeRowActive : ''}`}
                    onClick={() => onThemeChange(mode)}
                  >
                    <Icon size={14} aria-hidden className={styles.themeIcon} />
                    <span className={styles.themeLabel}>{label}</span>
                    {active ? <Check size={14} aria-hidden className={styles.themeCheck} /> : null}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
