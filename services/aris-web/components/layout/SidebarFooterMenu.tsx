'use client';

import { useEffect, useRef, useState } from 'react';
import { LogOut, Settings, Sun, Moon, Monitor, MoreHorizontal } from 'lucide-react';
import { withAppBasePath } from '@/lib/routing/appPath';
import type { ThemeMode } from '@/lib/theme/clientTheme';
import styles from './SidebarFooterMenu.module.css';

interface Props {
  user: { email: string; role: string };
  themeMode: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  onOpenSettings: () => void;
}

const THEME_ITEMS: Array<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: 'light', label: '라이트', Icon: Sun },
  { mode: 'dark', label: '다크', Icon: Moon },
  { mode: 'system', label: '시스템', Icon: Monitor },
];

export function SidebarFooterMenu({ user, themeMode, onThemeChange, onOpenSettings }: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const userInitial = (user.email?.trim()?.[0] ?? 'A').toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onClick);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onClick);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className={styles.root} ref={rootRef}>
      <button
        type="button"
        className={styles.trigger}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={styles.avatar}>{userInitial}</span>
        <span className={styles.identity}>
          <span className={styles.name}>{user.email.split('@')[0] || 'ARIS'}</span>
          <span className={styles.meta}>{user.role}</span>
        </span>
        <MoreHorizontal size={14} className={styles.chev} />
      </button>
      {open && (
        <div className={styles.panel} role="menu" aria-label="사용자 메뉴">
          <button
            type="button"
            role="menuitem"
            className={styles.item}
            onClick={() => { setOpen(false); onOpenSettings(); }}
          >
            <Settings size={14} /> Settings
          </button>
          <div className={styles.section} role="group" aria-label="테마">
            <div className={styles.sectionLabel}>테마</div>
            <div className={styles.themeRow}>
              {THEME_ITEMS.map(({ mode, label, Icon }) => {
                const active = themeMode === mode;
                return (
                  <button
                    key={mode}
                    type="button"
                    role="menuitemradio"
                    aria-checked={active}
                    className={`${styles.themeChip}${active ? ' ' + styles.themeChipActive : ''}`}
                    onClick={() => onThemeChange(mode)}
                  >
                    <Icon size={12} /> {label}
                  </button>
                );
              })}
            </div>
          </div>
          <form action={withAppBasePath('/api/auth/logout')} method="POST" className={styles.signoutForm}>
            <button type="submit" role="menuitem" className={`${styles.item} ${styles.signout}`}>
              <LogOut size={14} /> Sign out
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
