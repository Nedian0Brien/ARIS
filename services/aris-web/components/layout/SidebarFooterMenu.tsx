'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
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
type AnchorSide = 'left' | 'right';
interface PopoverPosition {
  top: number;
  left?: number;
  right?: number;
  anchorSide: AnchorSide;
}

const THEME_ITEMS: Array<{ mode: ThemeMode; label: string; Icon: typeof Sun }> = [
  { mode: 'light', label: '라이트', Icon: Sun },
  { mode: 'dark', label: '다크', Icon: Moon },
  { mode: 'system', label: '시스템', Icon: Monitor },
];

const POPOVER_GAP = 6;
const POPOVER_MIN_WIDTH = 240; // mirrors .panel min-width in module css
const VIEWPORT_PADDING = 8;

export function SidebarFooterMenu({ user, themeMode, onThemeChange, onOpenSettings }: Props) {
  const [activePopover, setActivePopover] = useState<ActivePopover>(null);
  const [position, setPosition] = useState<PopoverPosition | null>(null);
  const [mounted, setMounted] = useState(false);

  const rootRef = useRef<HTMLDivElement | null>(null);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const contextTriggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);

  const userInitial = (user.email?.trim()?.[0] ?? 'A').toUpperCase();
  const accountName = user.email.split('@')[0] || 'ARIS';

  useEffect(() => { setMounted(true); }, []);

  const computePosition = useCallback((next: ActivePopover) => {
    if (next === null) return null;
    const trigger = next === 'account' ? accountTriggerRef.current : contextTriggerRef.current;
    if (!trigger) return null;
    const rect = trigger.getBoundingClientRect();
    const top = rect.top - POPOVER_GAP;

    if (next === 'account') {
      // Anchor at trigger's left, extending right. Clamp so it doesn't
      // overflow the viewport's right edge on narrow displays.
      const maxLeft = window.innerWidth - POPOVER_MIN_WIDTH - VIEWPORT_PADDING;
      const left = Math.max(VIEWPORT_PADDING, Math.min(rect.left, maxLeft));
      return { top, left, anchorSide: 'left' as AnchorSide };
    }

    // Context popover: prefer right-anchor (popover extends LEFT from
    // trigger's right edge). When the trigger sits too close to the
    // viewport's left edge (narrow sidebar), that would push the popover
    // off-screen to the left — flip to a left-anchor (extends RIGHT from
    // trigger's left edge).
    const wouldOverflowLeft = rect.right - POPOVER_MIN_WIDTH < VIEWPORT_PADDING;
    if (wouldOverflowLeft) {
      const maxLeft = window.innerWidth - POPOVER_MIN_WIDTH - VIEWPORT_PADDING;
      const left = Math.max(VIEWPORT_PADDING, Math.min(rect.left, maxLeft));
      return { top, left, anchorSide: 'left' as AnchorSide };
    }
    const right = Math.max(VIEWPORT_PADDING, window.innerWidth - rect.right);
    return { top, right, anchorSide: 'right' as AnchorSide };
  }, []);

  useLayoutEffect(() => {
    if (activePopover === null) {
      setPosition(null);
      return;
    }
    setPosition(computePosition(activePopover));
  }, [activePopover, computePosition]);

  useEffect(() => {
    if (activePopover === null) return;
    const update = () => setPosition(computePosition(activePopover));
    window.addEventListener('resize', update);
    window.addEventListener('scroll', update, true);
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('scroll', update, true);
    };
  }, [activePopover, computePosition]);

  useEffect(() => {
    if (activePopover === null) return;
    const onClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (panelRef.current?.contains(target)) return;
      setActivePopover(null);
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

  const renderPanelContent = () => {
    if (activePopover === 'account') {
      return (
        <>
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
        </>
      );
    }
    if (activePopover === 'context') {
      return (
        <>
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
        </>
      );
    }
    return null;
  };

  const panelStyle: React.CSSProperties | undefined = position
    ? position.anchorSide === 'left'
      ? { top: position.top, left: position.left, transform: 'translateY(-100%)' }
      : { top: position.top, right: position.right, transform: 'translateY(-100%)' }
    : undefined;

  return (
    <div className={styles.root} ref={rootRef}>
      <div className={styles.row}>
        <button
          ref={accountTriggerRef}
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
          ref={contextTriggerRef}
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

      {mounted && activePopover !== null && position
        ? createPortal(
            <div
              ref={panelRef}
              id={activePopover === 'account' ? 'sidebar-footer-account-panel' : 'sidebar-footer-context-panel'}
              className={`${styles.panel} ${activePopover === 'account' ? styles.accountPanel : styles.contextPanel}`}
              role="menu"
              aria-label={activePopover === 'account' ? '계정 메뉴' : '환경 메뉴'}
              style={panelStyle}
            >
              {renderPanelContent()}
            </div>,
            document.body,
          )
        : null}
    </div>
  );
}
