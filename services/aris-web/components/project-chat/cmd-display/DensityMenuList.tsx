'use client';
import React from 'react';
import { Check } from 'lucide-react';
import { useDensityStore, type DensityMode } from './densityStore';

const OPTIONS: { mode: DensityMode; label: string; hint: string }[] = [
  { mode: 'auto',     label: '자동', hint: '실행 중 확장, 최근 1개 기본, 그 외 최소' },
  { mode: 'expanded', label: '확장', hint: '모든 액션에 결과 보이기' },
  { mode: 'default',  label: '기본', hint: '명령어 한 줄' },
  { mode: 'minimal',  label: '최소', hint: '배지만 표시' },
];

export function DensityMenuList({ onSelect }: { onSelect?: () => void }) {
  const global = useDensityStore((s) => s.global);
  const setGlobal = useDensityStore((s) => s.setGlobal);
  return (
    <div className="ch-density-menu" role="menu">
      {OPTIONS.map(({ mode, label, hint }) => (
        <button
          key={mode}
          type="button"
          role="menuitemradio"
          aria-checked={global === mode}
          className={`ch-density-menu__item${global === mode ? ' is-active' : ''}`}
          onClick={() => { setGlobal(mode); onSelect?.(); }}
        >
          <span className="ch-density-menu__check">
            {global === mode && <Check size={13} />}
          </span>
          <span className="ch-density-menu__main">
            <span className="ch-density-menu__label">{label}</span>
            <span className="ch-density-menu__hint">{hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
