'use client';
import React from 'react';
import { useDensityStore, type DensityMode } from './densityStore';

const OPTIONS: { mode: DensityMode; label: string }[] = [
  { mode: 'auto', label: '자동' },
  { mode: 'expanded', label: '확장' },
  { mode: 'default', label: '기본' },
  { mode: 'minimal', label: '최소' },
];

export function DensityToggle() {
  const global = useDensityStore((s) => s.global);
  const setGlobal = useDensityStore((s) => s.setGlobal);
  return (
    <div className="cmd-density-toggle" role="tablist" aria-label="액션 카드 밀도">
      {OPTIONS.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          role="tab"
          aria-selected={global === mode}
          onClick={() => setGlobal(mode)}
        >{label}</button>
      ))}
    </div>
  );
}
