'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FolderOpen, Image as ImageIcon, Loader2, Puzzle, Search, X } from 'lucide-react';
import { SKILL_SOURCE_LABELS } from '@/components/project-chat/helpers/skillEntries';
import type { ProjectSkillEntry } from '@/lib/projectSkills';

function matchesQuery(entry: ProjectSkillEntry, normalizedQuery: string): boolean {
  return entry.command.toLowerCase().includes(normalizedQuery)
    || entry.name.toLowerCase().includes(normalizedQuery)
    || (entry.description?.toLowerCase().includes(normalizedQuery) ?? false);
}

/**
 * 컴포저 + 버튼이 여는 바텀 액션 시트.
 * 단일 뷰: 상단 빠른 작업(사진 첨부/파일) 아래에 스킬·플러그인 목록이
 * 이어진다. 목록은 검색으로 필터링하거나 시트 내부 스크롤로 탐색하고,
 * 최근 사용한 스킬은 목록 상단에 고정된다.
 */
export function ProjectComposerActionSheet({
  onClose,
  onLoadSkills,
  onOpenFiles,
  onPickPhoto,
  onSkillSelect,
  open,
  recentCommands,
  skills,
  skillsError,
  skillsLoading,
}: {
  onClose: () => void;
  onLoadSkills: () => void;
  onOpenFiles: () => void;
  onPickPhoto: () => void;
  onSkillSelect: (entry: ProjectSkillEntry) => void;
  open: boolean;
  recentCommands: string[];
  skills: ProjectSkillEntry[];
  skillsError: string | null;
  skillsLoading: boolean;
}) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (open) {
      setQuery('');
      onLoadSkills();
    }
  }, [open, onLoadSkills]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', closeOnEscape);
    return () => document.removeEventListener('keydown', closeOnEscape);
  }, [open, onClose]);

  const normalizedQuery = query.trim().toLowerCase();
  const visibleSkills = useMemo(
    () => (normalizedQuery ? skills.filter((entry) => matchesQuery(entry, normalizedQuery)) : skills),
    [skills, normalizedQuery],
  );
  const recentEntries = useMemo(() => {
    if (normalizedQuery) {
      return [];
    }
    return recentCommands
      .map((command) => skills.find((entry) => entry.command === command))
      .filter((entry): entry is ProjectSkillEntry => Boolean(entry));
  }, [recentCommands, skills, normalizedQuery]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const renderSkill = (entry: ProjectSkillEntry, keyPrefix = '') => (
    <button
      key={`${keyPrefix}${entry.id}`}
      type="button"
      className="pc-sheet__skill"
      onClick={() => onSkillSelect(entry)}
    >
      <span className="pc-sheet__skill-command">
        {entry.command}
        {entry.argumentHint && <span className="pc-sheet__skill-arg"> {entry.argumentHint}</span>}
      </span>
      <span className="pc-sheet__skill-meta">
        <span className="pc-sheet__skill-source">{SKILL_SOURCE_LABELS[entry.source]}</span>
        {entry.description && <span className="pc-sheet__skill-desc">{entry.description}</span>}
      </span>
    </button>
  );

  return createPortal(
    <div className="pc-sheet" role="dialog" aria-modal="true" aria-label="컴포저 추가 작업">
      <div className="pc-sheet__backdrop" onClick={onClose} />
      <div className="pc-sheet__panel">
        <div className="pc-sheet__grip" aria-hidden="true" />
        <div className="pc-sheet__head">
          <span className="pc-sheet__title">추가 작업</span>
          <button type="button" className="pc-sheet__close" aria-label="닫기" onClick={onClose}>
            <X size={14} />
          </button>
        </div>
        <div className="pc-sheet__scroll">
          <div className="pc-sheet__items">
            <button type="button" className="pc-sheet__item" onClick={onPickPhoto}>
              <span className="pc-sheet__item-icon"><ImageIcon size={17} /></span>
              <span className="pc-sheet__item-body">
                <span className="pc-sheet__item-name">사진 첨부</span>
                <span className="pc-sheet__item-desc">이미지를 업로드해 프롬프트에 첨부합니다</span>
              </span>
            </button>
            <button type="button" className="pc-sheet__item" onClick={onOpenFiles}>
              <span className="pc-sheet__item-icon"><FolderOpen size={17} /></span>
              <span className="pc-sheet__item-body">
                <span className="pc-sheet__item-name">파일</span>
                <span className="pc-sheet__item-desc">워크스페이스 파일을 탐색합니다</span>
              </span>
            </button>
          </div>
          <div className="pc-sheet__section">
            <div className="pc-sheet__section-row">
              <span className="pc-sheet__section-icon"><Puzzle size={13} /></span>
              <span className="pc-sheet__section-title">스킬·플러그인</span>
              <span className="pc-sheet__section-hint">탭하면 슬래시 커맨드가 삽입됩니다</span>
            </div>
            <div className="pc-sheet__search">
              <Search size={13} className="pc-sheet__search-icon" />
              <input
                type="search"
                className="pc-sheet__search-input"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="스킬 검색"
                aria-label="스킬 검색"
              />
              {query && (
                <button
                  type="button"
                  className="pc-sheet__search-clear"
                  aria-label="검색어 지우기"
                  onClick={() => setQuery('')}
                >
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
          <div className="pc-sheet__list">
            {skillsLoading && (
              <div className="pc-sheet__state">
                <Loader2 size={15} className="pc-sheet__spin" />
                <span>불러오는 중...</span>
              </div>
            )}
            {!skillsLoading && skillsError && (
              <div className="pc-sheet__state pc-sheet__state--error">{skillsError}</div>
            )}
            {!skillsLoading && !skillsError && skills.length === 0 && (
              <div className="pc-sheet__state">
                사용 가능한 스킬이 없습니다. 프로젝트의 .claude/commands 또는 .claude/skills에 추가하세요.
              </div>
            )}
            {!skillsLoading && !skillsError && recentEntries.length > 0 && (
              <>
                <div className="pc-sheet__group-label">최근 사용</div>
                {recentEntries.map((entry) => renderSkill(entry, 'recent-'))}
                <div className="pc-sheet__group-label">전체</div>
              </>
            )}
            {!skillsLoading && !skillsError && visibleSkills.map((entry) => renderSkill(entry))}
            {!skillsLoading && !skillsError && normalizedQuery && skills.length > 0 && visibleSkills.length === 0 && (
              <div className="pc-sheet__state">&lsquo;{query.trim()}&rsquo;에 해당하는 스킬이 없습니다.</div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}
