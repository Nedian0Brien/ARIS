'use client';

import { useEffect, useRef, useState } from 'react';
import { Home, Monitor, Moon, MoreHorizontal, Settings, Sun } from 'lucide-react';
import type { ThemeMode } from '@/lib/theme/clientTheme';

const THEME_OPTIONS = [
  { mode: 'system' as const, label: '시스템', Icon: Monitor },
  { mode: 'light' as const, label: '라이트', Icon: Sun },
  { mode: 'dark' as const, label: '다크', Icon: Moon },
];

/** 홈 이동(선택)/설정/테마 전환 항목. 독립 트리거를 가진 메뉴와 기존 메뉴에 얹는 용도 모두에서 쓴다. */
export function AppChromeMenuItems({
  onLogoHome,
  onOpenSettings,
  onSelect,
  onThemeChange,
  themeMode,
}: {
  onLogoHome?: () => void;
  onOpenSettings: () => void;
  onSelect: () => void;
  onThemeChange: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}) {
  return (
    <>
      {onLogoHome && (
        <div className="m-context-menu__section">
          <button
            type="button"
            role="menuitem"
            className="m-context-menu__item"
            onClick={() => { onSelect(); onLogoHome(); }}
          >
            <Home size={13} aria-hidden="true" />
            <span>홈으로 이동</span>
          </button>
        </div>
      )}
      <div className="m-context-menu__section">
        <button
          type="button"
          role="menuitem"
          className="m-context-menu__item"
          onClick={() => { onSelect(); onOpenSettings(); }}
        >
          <Settings size={13} aria-hidden="true" />
          <span>설정</span>
        </button>
      </div>
      <div className="m-context-menu__section">
        <div className="m-context-menu__label">테마</div>
        <div className="m-theme-toggle" role="group" aria-label="테마 선택">
          {THEME_OPTIONS.map(({ mode, label, Icon }) => {
            const active = themeMode === mode;
            return (
              <button
                key={mode}
                type="button"
                role="menuitemradio"
                className={`m-theme-toggle__item${active ? ' m-theme-toggle__item--active' : ''}`}
                aria-checked={active}
                aria-label={`${label} 테마`}
                title={`${label} 테마`}
                onClick={() => { onThemeChange(mode); onSelect(); }}
              >
                <Icon size={13} />
                <span className="m-theme-toggle__label">{label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** 자체 트리거 버튼 + 드롭다운을 가진 독립형 앱 크롬 메뉴 (Topbar용). */
export function AppChromeMenu({
  onOpenSettings,
  onThemeChange,
  themeMode,
}: {
  onOpenSettings: () => void;
  onThemeChange: (mode: ThemeMode) => void;
  themeMode: ThemeMode;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnOutsidePointer = (event: MouseEvent) => {
      if (menuRef.current?.contains(event.target as Node)) {
        return;
      }
      setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', closeOnOutsidePointer);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsidePointer);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [open]);

  return (
    <div className="m-context-menu" ref={menuRef}>
      <button
        type="button"
        className="m-context-menu__button"
        aria-label="상단 헤더 메뉴"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="m-context-menu__panel" role="menu" aria-label="상단 헤더 메뉴">
          <AppChromeMenuItems
            onOpenSettings={onOpenSettings}
            onSelect={() => setOpen(false)}
            onThemeChange={onThemeChange}
            themeMode={themeMode}
          />
        </div>
      )}
    </div>
  );
}
