'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, FolderOpen, Image as ImageIcon, Loader2, Puzzle, X } from 'lucide-react';
import type { ProjectSkillEntry } from '@/lib/projectSkills';

const SOURCE_LABELS: Record<ProjectSkillEntry['source'], string> = {
  'project-command': '프로젝트 커맨드',
  'project-skill': '프로젝트 스킬',
  'user-command': '내 커맨드',
  'user-skill': '내 스킬',
};

/**
 * 컴포저 + 버튼이 여는 바텀 액션 시트.
 * 메인 뷰(사진 첨부/파일/스킬·플러그인)와 스킬 목록 뷰를 오간다.
 */
export function ProjectComposerActionSheet({
  onClose,
  onLoadSkills,
  onOpenFiles,
  onPickPhoto,
  onSkillSelect,
  open,
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
  skills: ProjectSkillEntry[];
  skillsError: string | null;
  skillsLoading: boolean;
}) {
  const [view, setView] = useState<'actions' | 'skills'>('actions');

  useEffect(() => {
    if (open) {
      setView('actions');
    }
  }, [open]);

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

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div className="pc-sheet" role="dialog" aria-modal="true" aria-label="컴포저 추가 작업">
      <div className="pc-sheet__backdrop" onClick={onClose} />
      <div className="pc-sheet__panel">
        <div className="pc-sheet__grip" aria-hidden="true" />
        {view === 'actions' ? (
          <>
            <div className="pc-sheet__head">
              <span className="pc-sheet__title">추가 작업</span>
              <button type="button" className="pc-sheet__close" aria-label="닫기" onClick={onClose}>
                <X size={14} />
              </button>
            </div>
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
              <button
                type="button"
                className="pc-sheet__item"
                onClick={() => {
                  onLoadSkills();
                  setView('skills');
                }}
              >
                <span className="pc-sheet__item-icon"><Puzzle size={17} /></span>
                <span className="pc-sheet__item-body">
                  <span className="pc-sheet__item-name">스킬·플러그인</span>
                  <span className="pc-sheet__item-desc">슬래시 커맨드를 프롬프트에 삽입합니다</span>
                </span>
                <ChevronRight size={15} className="pc-sheet__item-chevron" />
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="pc-sheet__head">
              <button type="button" className="pc-sheet__back" aria-label="뒤로" onClick={() => setView('actions')}>
                <ChevronLeft size={15} />
              </button>
              <span className="pc-sheet__title">스킬·플러그인</span>
              <button type="button" className="pc-sheet__close" aria-label="닫기" onClick={onClose}>
                <X size={14} />
              </button>
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
              {!skillsLoading && !skillsError && skills.map((entry) => (
                <button
                  key={entry.id}
                  type="button"
                  className="pc-sheet__skill"
                  onClick={() => onSkillSelect(entry)}
                >
                  <span className="pc-sheet__skill-command">{entry.command}</span>
                  <span className="pc-sheet__skill-meta">
                    <span className="pc-sheet__skill-source">{SOURCE_LABELS[entry.source]}</span>
                    {entry.description && <span className="pc-sheet__skill-desc">{entry.description}</span>}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  );
}
