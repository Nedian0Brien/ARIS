'use client';

import { Loader2 } from 'lucide-react';
import { SKILL_SOURCE_LABELS } from '@/components/project-chat/helpers/skillEntries';
import type { ProjectSkillEntry } from '@/lib/projectSkills';

/**
 * 컴포저에서 `/` 입력 시 뜨는 인라인 스킬 자동완성.
 * 컴포저 카드(.cmp) 위에 앵커되며, 키보드 내비게이션 상태는 부모가 관리한다.
 */
export function ProjectComposerSlashAutocomplete({
  activeIndex,
  entries,
  loading,
  onHoverIndex,
  onSelect,
  open,
}: {
  activeIndex: number;
  entries: ProjectSkillEntry[];
  loading: boolean;
  onHoverIndex: (index: number) => void;
  onSelect: (entry: ProjectSkillEntry) => void;
  open: boolean;
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="cmp-slash" role="listbox" aria-label="스킬 자동완성">
      {loading && entries.length === 0 && (
        <div className="cmp-slash__state">
          <Loader2 size={13} className="cmp-slash__spin" />
          <span>스킬 불러오는 중...</span>
        </div>
      )}
      {entries.map((entry, index) => (
        <button
          key={entry.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`cmp-slash__item${index === activeIndex ? ' cmp-slash__item--active' : ''}`}
          onMouseEnter={() => onHoverIndex(index)}
          onClick={() => onSelect(entry)}
        >
          <span className="cmp-slash__command">{entry.command}</span>
          {entry.description && <span className="cmp-slash__desc">{entry.description}</span>}
          <span className="cmp-slash__source">{SKILL_SOURCE_LABELS[entry.source]}</span>
        </button>
      ))}
    </div>
  );
}
