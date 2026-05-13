import { createPortal } from 'react-dom';
import { FolderKanban, Trash2, X } from 'lucide-react';
import styles from '../../CustomizationSidebar.module.css';
import type { FileActionDialog } from '../types';

type Props = {
  dialog: FileActionDialog | null;
  isMounted: boolean;
  onChangeValue: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
};

export function CustomizationFileActionDialog({
  dialog,
  isMounted,
  onChangeValue,
  onClose,
  onConfirm,
}: Props) {
  if (!isMounted || !dialog) {
    return null;
  }

  return createPortal(
    <div className={styles.modalOverlay} onClick={onClose}>
      <section className={styles.actionDialogCard} onClick={(event) => event.stopPropagation()}>
        <div className={styles.modalHeader}>
          <div>
            <div className={styles.eyebrow}>
              {dialog.kind === 'delete' ? <Trash2 size={13} /> : <FolderKanban size={13} />}
              {dialog.kind === 'create-file'
                ? 'New File'
                : dialog.kind === 'create-folder'
                  ? 'New Folder'
                  : dialog.kind === 'rename'
                    ? 'Rename'
                    : 'Delete'}
            </div>
            <h4 className={styles.modalTitle}>
              {dialog.kind === 'create-file'
                ? '새 파일 만들기'
                : dialog.kind === 'create-folder'
                  ? '새 폴더 만들기'
                  : dialog.kind === 'rename'
                    ? `${dialog.targetName} 이름 변경`
                    : `${dialog.targetName} 삭제`}
            </h4>
            <p className={styles.modalSubtle}>
              {'value' in dialog ? dialog.targetPath : `삭제 대상: ${dialog.targetPath}`}
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
        <div className={styles.actionDialogBody}>
          {'value' in dialog ? (
            <input
              autoFocus
              className={styles.actionDialogInput}
              value={dialog.value}
              onChange={(event) => onChangeValue(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onConfirm();
                }
              }}
              placeholder={dialog.kind === 'rename' ? '새 이름' : '이름 입력'}
            />
          ) : (
            <p className={styles.actionDialogCopy}>
              이 작업은 되돌릴 수 없습니다. 정말 삭제하시겠습니까?
            </p>
          )}
          <div className={styles.actionDialogActions}>
            <button type="button" className={styles.pathButton} onClick={onClose}>
              취소
            </button>
            <button
              type="button"
              className={`${styles.pathButton} ${styles.actionDialogConfirm}`}
              onClick={onConfirm}
            >
              {dialog.kind === 'delete' ? '삭제' : '확인'}
            </button>
          </div>
        </div>
      </section>
    </div>,
    document.body,
  );
}
