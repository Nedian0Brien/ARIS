import { createPortal } from 'react-dom';
import { Blocks, FileText, Loader2, Save, X } from 'lucide-react';
import styles from '../../CustomizationSidebar.module.css';
import type { InstructionDocSummary, SkillSummary } from '../types';

type Props = {
  activeInstructionModal: InstructionDocSummary | null;
  activeModalKind: 'instruction' | 'skill' | 'file' | null;
  activeSkillModal: SkillSummary | null;
  instructionContent: string;
  instructionDirty: boolean;
  instructionLoading: boolean;
  instructionSaving: boolean;
  instructionStatus: string | null;
  isMounted: boolean;
  skillContent: string;
  skillError: string | null;
  skillLoading: boolean;
  onChangeInstruction: (value: string) => void;
  onClose: () => void;
  onSaveInstruction: () => void;
};

export function CustomizationContentModal({
  activeInstructionModal,
  activeModalKind,
  activeSkillModal,
  instructionContent,
  instructionDirty,
  instructionLoading,
  instructionSaving,
  instructionStatus,
  isMounted,
  skillContent,
  skillError,
  skillLoading,
  onChangeInstruction,
  onClose,
  onSaveInstruction,
}: Props) {
  if (!isMounted || !activeModalKind || activeModalKind === 'file') {
    return null;
  }

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <section className={styles.modalCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.eyebrow}>
              {activeModalKind === 'instruction' ? <FileText size={13} /> : <Blocks size={13} />}
              {activeModalKind === 'instruction' ? 'Document Editor' : 'Skill Viewer'}
            </div>
            <h4 className={styles.modalTitle}>
              {activeInstructionModal?.name ?? activeSkillModal?.name ?? '선택 없음'}
            </h4>
            <p className={styles.modalSubtle}>
              {activeInstructionModal?.path ?? activeSkillModal?.relativePath ?? '내용을 확인할 수 없습니다.'}
            </p>
          </div>
          <button
            type="button"
            className={styles.modalCloseButton}
            onClick={onClose}
            aria-label="모달 닫기"
            title="모달 닫기"
          >
            <X size={16} />
          </button>
        </div>
        <div className={styles.modalBody}>
          {activeModalKind === 'instruction' ? (
            activeInstructionModal ? (
              instructionLoading ? (
                <div className={styles.loadingState}>
                  <Loader2 size={16} className={styles.rotate} />
                  <p>문서를 불러오는 중입니다.</p>
                </div>
              ) : (
                <>
                  <textarea
                    className={styles.editor}
                    value={instructionContent}
                    onChange={(event) => onChangeInstruction(event.target.value)}
                    spellCheck={false}
                  />
                  <div className={styles.actions}>
                    <span className={styles.statusText}>
                      {instructionStatus ?? (instructionDirty ? '저장되지 않은 변경사항 있음' : '변경사항 없음')}
                    </span>
                    <button
                      type="button"
                      className={styles.saveButton}
                      onClick={onSaveInstruction}
                      disabled={instructionSaving || instructionLoading || !instructionDirty}
                    >
                      {instructionSaving ? <Loader2 size={14} className={styles.rotate} /> : <Save size={14} />}
                      저장
                    </button>
                  </div>
                </>
              )
            ) : (
              <div className={styles.emptyState}>
                <FileText size={18} />
                <p>편집할 문서를 선택해 주세요.</p>
              </div>
            )
          ) : activeSkillModal ? (
            skillLoading ? (
              <div className={styles.loadingState}>
                <Loader2 size={16} className={styles.rotate} />
                <p>스킬 본문을 불러오는 중입니다.</p>
              </div>
            ) : skillError ? (
              <div className={styles.errorState}>
                <Blocks size={18} />
                <p>{skillError}</p>
              </div>
            ) : (
              <div className={styles.preview}>
                <pre>{skillContent}</pre>
              </div>
            )
          ) : (
            <div className={styles.emptyState}>
              <Blocks size={18} />
              <p>확인할 Skill을 선택해 주세요.</p>
            </div>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
