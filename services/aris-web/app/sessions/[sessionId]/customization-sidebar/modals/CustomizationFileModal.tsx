import { createPortal } from 'react-dom';
import { AlertTriangle, FileText, Loader2, X } from 'lucide-react';
import { WorkspaceFileEditor } from '@/components/files/WorkspaceFileEditor';
import styles from '../../CustomizationSidebar.module.css';
import { formatBytes } from '../shared';
import type { FilePreviewBlock } from '../types';

type ActiveFileModal = {
  path: string;
  name: string;
};

type Props = {
  activeFileModal: ActiveFileModal | null;
  fileContent: string;
  fileDirty: boolean;
  fileLoading: boolean;
  fileNavState: { canGoBack: boolean; canGoForward: boolean };
  filePreviewBlock: FilePreviewBlock | null;
  fileSaving: boolean;
  fileStatus: string | null;
  isMounted: boolean;
  navigationRequestKey: number;
  requestedLine: number | null;
  workspaceRootPath: string;
  onBack: () => void;
  onChange: (value: string) => void;
  onClose: () => void;
  onForward: () => void;
  onOpenWikilink: (wikilinkPath: string, fromPath: string) => void;
  onSave: () => void;
};

export function CustomizationFileModal({
  activeFileModal,
  fileContent,
  fileDirty,
  fileLoading,
  fileNavState,
  filePreviewBlock,
  fileSaving,
  fileStatus,
  isMounted,
  navigationRequestKey,
  requestedLine,
  workspaceRootPath,
  onBack,
  onChange,
  onClose,
  onForward,
  onOpenWikilink,
  onSave,
}: Props) {
  if (!isMounted || !activeFileModal) {
    return null;
  }

  const isPreviewBlocked = Boolean(filePreviewBlock);

  return createPortal(
    <div
      className={`${styles.modalOverlay} ${isPreviewBlocked ? styles.fileModalBlockedOverlay : ''}`}
      onClick={onClose}
    >
      <section
        className={`${styles.modalCard} ${styles.fileModalCard} ${isPreviewBlocked ? styles.fileModalBlockedCard : ''}`}
        onClick={(event) => event.stopPropagation()}
      >
        {fileLoading ? (
          <div className={`${styles.modalBody} ${styles.fileModalBody}`}>
            <div className={styles.loadingState}>
              <Loader2 size={16} className={styles.rotate} />
              <p>파일을 불러오는 중입니다.</p>
            </div>
          </div>
        ) : isPreviewBlocked ? (
          <>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.eyebrow}>
                  <AlertTriangle size={13} />
                  File Preview
                </div>
                <h4 className={styles.modalTitle}>미리보기를 제공하지 않는 파일입니다</h4>
                <p className={styles.modalSubtle}>{activeFileModal.path}</p>
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
            <div className={`${styles.modalBody} ${styles.fileModalBody} ${styles.fileModalBlockedBody}`}>
              <div className={styles.filePreviewBlocked}>
                <AlertTriangle size={18} />
                <div className={styles.filePreviewBlockedText}>
                  <strong>
                    {filePreviewBlock.reason === 'binary'
                      ? '바이너리 파일은 에디터에서 미리보기를 지원하지 않습니다.'
                      : '큰 파일은 우측 모달에서 직접 열지 않습니다.'}
                  </strong>
                  <span>파일 크기: {formatBytes(filePreviewBlock.sizeBytes)}</span>
                  <span>
                    {filePreviewBlock.reason === 'binary'
                      ? '텍스트 파일만 미리보기와 편집을 지원합니다.'
                      : '대용량 파일은 별도 편집기나 로컬 도구에서 여는 방식을 권장합니다.'}
                  </span>
                </div>
              </div>
            </div>
          </>
        ) : (
          <>
            {fileStatus ? <div className={styles.fileModalStatus}>{fileStatus}</div> : null}
            <div className={`${styles.modalBody} ${styles.fileModalBody}`}>
              <WorkspaceFileEditor
                fileName={activeFileModal.name}
                filePath={activeFileModal.path}
                workspaceRootPath={workspaceRootPath}
                content={fileContent}
                requestedLine={requestedLine}
                navigationRequestKey={navigationRequestKey}
                isSaving={fileSaving}
                saveDisabled={fileSaving || fileLoading || !fileDirty}
                canGoBack={fileNavState.canGoBack}
                canGoForward={fileNavState.canGoForward}
                className={styles.fileModalEditor}
                onChange={onChange}
                onSave={onSave}
                onClose={onClose}
                onWikilinkClick={(wikilinkPath) => onOpenWikilink(wikilinkPath, activeFileModal.path)}
                onBack={onBack}
                onForward={onForward}
              />
            </div>
          </>
        )}
        {!activeFileModal ? (
          <div className={styles.emptyState}>
            <FileText size={18} />
            <p>편집할 파일을 선택해 주세요.</p>
          </div>
        ) : null}
      </section>
    </div>,
    document.body,
  );
}
