import type { ReactNode } from 'react';
import { ArrowUpCircle, FilePlus, FolderKanban, FolderPlus, Loader2, Search } from 'lucide-react';
import styles from '../../CustomizationSidebar.module.css';

type Props = {
  filesCountLabel: string;
  filesError: string | null;
  filesLoading: boolean;
  filesPath: string;
  filesParentPath: string | null;
  filesSearchLoading: boolean;
  filesSearchQuery: string;
  hasSearchResults: boolean;
  normalizedWorkspaceRootPath: string;
  renderedTree: ReactNode;
  visibleFilesLength: number;
  onCreateFile: () => void;
  onCreateFolder: () => void;
  onGoRoot: () => void;
  onGoParent: () => void;
  onSearchChange: (value: string) => void;
};

export function CustomizationFilesSection({
  filesCountLabel,
  filesError,
  filesLoading,
  filesPath,
  filesParentPath,
  filesSearchLoading,
  filesSearchQuery,
  hasSearchResults,
  normalizedWorkspaceRootPath,
  renderedTree,
  visibleFilesLength,
  onCreateFile,
  onCreateFolder,
  onGoParent,
  onGoRoot,
  onSearchChange,
}: Props) {
  return (
    <div className={styles.content}>
      <div className={styles.listCard}>
        <div className={styles.cardHeader}>
          <span className={styles.cardTitle}>Workspace Files</span>
          <span className={styles.cardMeta}>{filesCountLabel}</span>
        </div>
        <div className={styles.filesToolbar}>
          <label className={styles.searchField}>
            <Search size={14} />
            <input
              className={styles.searchInput}
              value={filesSearchQuery}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="파일 또는 폴더 검색"
            />
          </label>
          <div className={styles.filesActionRow}>
            <button type="button" className={styles.pathButton} onClick={onCreateFile}>
              <FilePlus size={14} />
              새 파일
            </button>
            <button type="button" className={styles.pathButton} onClick={onCreateFolder}>
              <FolderPlus size={14} />
              새 폴더
            </button>
          </div>
          <div className={styles.pathRow}>
            {filesParentPath !== null && !hasSearchResults ? (
              <button
                type="button"
                className={styles.pathButton}
                onClick={onGoParent}
                disabled={filesParentPath === null || filesParentPath === normalizedWorkspaceRootPath && filesPath === normalizedWorkspaceRootPath}
              >
                <ArrowUpCircle size={14} />
                상위 폴더
              </button>
            ) : null}
            <button type="button" className={styles.pathButton} onClick={onGoRoot}>
              <FolderKanban size={14} />
              워크스페이스 루트
            </button>
            <span className={styles.pathValue}>{hasSearchResults ? '검색 결과' : filesPath}</span>
          </div>
        </div>
        <div className={styles.itemList}>
          {filesLoading || filesSearchLoading ? (
            <div className={styles.loadingState}>
              <Loader2 size={16} className={styles.rotate} />
              <p>{filesSearchLoading ? '파일을 검색하는 중입니다.' : '파일 목록을 불러오는 중입니다.'}</p>
            </div>
          ) : filesError ? (
            <div className={styles.errorState}>
              <FolderKanban size={18} />
              <p>{filesError}</p>
            </div>
          ) : visibleFilesLength === 0 ? (
            <div className={styles.emptyState}>
              <FolderKanban size={18} />
              <p>{hasSearchResults ? '검색 결과가 없습니다.' : '표시할 파일이 없습니다.'}</p>
            </div>
          ) : (
            renderedTree
          )}
        </div>
      </div>
    </div>
  );
}
