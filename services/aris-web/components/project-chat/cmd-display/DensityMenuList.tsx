'use client';
import React from 'react';
import type { ComponentType } from 'react';
import { AlignJustify, Check, Maximize2, Minimize2, Sparkles } from 'lucide-react';
import { useDensityStore, type DensityMode } from './densityStore';

type IconCmp = ComponentType<{ size?: number }>;

const OPTIONS: { mode: DensityMode; label: string; hint: string; Icon: IconCmp }[] = [
  { mode: 'auto',     label: '자동', hint: '실행 중 확장, 최근 1개 기본, 그 외 최소', Icon: Sparkles },
  { mode: 'expanded', label: '확장', hint: '모든 액션에 결과 보이기',                Icon: Maximize2 },
  { mode: 'default',  label: '기본', hint: '명령어 한 줄',                          Icon: AlignJustify },
  { mode: 'minimal',  label: '최소', hint: '배지만 표시',                            Icon: Minimize2 },
];

export function DensityMenuList({ onSelect }: { onSelect?: () => void }) {
  const global = useDensityStore((s) => s.global);
  const setGlobal = useDensityStore((s) => s.setGlobal);
  return (
    <div className="ch-density-menu" role="menu">
      {OPTIONS.map(({ mode, label, hint, Icon }) => (
        <button
          key={mode}
          type="button"
          role="menuitemradio"
          aria-checked={global === mode}
          className={`ch-density-menu__item${global === mode ? ' is-active' : ''}`}
          onClick={() => { setGlobal(mode); onSelect?.(); }}
        >
          <span className="ch-density-menu__icon" aria-hidden="true">
            <Icon size={14} />
          </span>
          <span className="ch-density-menu__main">
            <span className="ch-density-menu__label">{label}</span>
            <span className="ch-density-menu__hint">{hint}</span>
          </span>
          <span className="ch-density-menu__check" aria-hidden="true">
            {global === mode && <Check size={13} />}
          </span>
        </button>
      ))}
    </div>
  );
}
