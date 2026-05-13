'use client';

import React from 'react';
import { Clock, X } from 'lucide-react';
import { getFileIcon } from '../helpers';
import styles from '../../ChatInterface.module.css';

type FileBrowserItem = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile?: boolean;
};

export function FileBrowserModal({
  fileBrowserQuery,
  fileBrowserSearchResults,
  fileBrowserSearchLoading,
  recentAttachments,
  fileBrowserParentPath,
  fileBrowserPath,
  fileBrowserLoading,
  fileBrowserError,
  fileBrowserItems,
  onClose,
  onSearchChange,
  onClearSearch,
  onSearchResultSelect,
  onBrowseParent,
  onBrowseItem,
  onRecentAttachmentSelect,
}: {
  fileBrowserQuery: string;
  fileBrowserSearchResults: FileBrowserItem[] | null;
  fileBrowserSearchLoading: boolean;
  recentAttachments: string[];
  fileBrowserParentPath: string | null;
  fileBrowserPath: string;
  fileBrowserLoading: boolean;
  fileBrowserError: string | null;
  fileBrowserItems: FileBrowserItem[];
  onClose: () => void;
  onSearchChange: (value: string) => void;
  onClearSearch: () => void;
  onSearchResultSelect: (item: FileBrowserItem) => void;
  onBrowseParent: () => void;
  onBrowseItem: (item: FileBrowserItem) => void;
  onRecentAttachmentSelect: (path: string) => void;
}) {
  return (
    <div className={styles.modalOverlay} onClick={onClose}>
      <div className={styles.fileBrowserModal} onClick={(event) => event.stopPropagation()}>
        <div className={styles.fileBrowserHeader}>
          <div className={styles.fileBrowserTitle}>파일 선택</div>
          <button type="button" className={styles.btnClose} onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className={styles.fileBrowserSearchBar}>
          <input
            type="text"
            className={styles.fileBrowserSearchInput}
            placeholder="파일명 검색..."
            value={fileBrowserQuery}
            onChange={(event) => onSearchChange(event.target.value)}
            autoFocus
          />
          {fileBrowserQuery && (
            <button
              type="button"
              className={styles.fileBrowserSearchClear}
              onClick={onClearSearch}
              aria-label="검색 초기화"
            >
              <X size={13} />
            </button>
          )}
        </div>

        {fileBrowserSearchResults !== null ? (
          <div className={styles.fileBrowserList}>
            {fileBrowserSearchLoading && (
              <div className={styles.fileBrowserLoader}>검색 중...</div>
            )}
            {!fileBrowserSearchLoading && fileBrowserSearchResults.length === 0 && (
              <div className={styles.fileBrowserEmpty}>검색 결과가 없습니다</div>
            )}
            {!fileBrowserSearchLoading && fileBrowserSearchResults.map((item) => (
              <button
                key={item.path}
                type="button"
                className={`${styles.fileBrowserItem} ${item.isDirectory ? styles.fileBrowserDir : styles.fileBrowserFile}`}
                onClick={() => onSearchResultSelect(item)}
              >
                <span className={styles.fileBrowserItemIcon}>{getFileIcon(item.name, item.isDirectory)}</span>
                <span className={styles.fileBrowserItemName}>{item.name}</span>
                <span className={styles.fileBrowserItemPath}>{item.path}</span>
              </button>
            ))}
          </div>
        ) : (
          <>
            {recentAttachments.length > 0 && (
              <div className={styles.fileBrowserRecent}>
                <div className={styles.fileBrowserSectionLabel}>
                  <Clock size={11} /> 최근 파일
                </div>
                {recentAttachments.map((filePath) => {
                  const name = filePath.split('/').filter(Boolean).pop() ?? filePath;
                  return (
                    <button
                      key={filePath}
                      type="button"
                      className={`${styles.fileBrowserItem} ${styles.fileBrowserFile}`}
                      onClick={() => onRecentAttachmentSelect(filePath)}
                    >
                      <span className={styles.fileBrowserItemIcon}>{getFileIcon(name, false)}</span>
                      <span className={styles.fileBrowserItemName}>{name}</span>
                      <span className={styles.fileBrowserItemPath}>{filePath}</span>
                    </button>
                  );
                })}
              </div>
            )}

            <div className={styles.fileBrowserPath}>
              {fileBrowserParentPath !== null && (
                <button
                  type="button"
                  className={styles.fileBrowserBackBtn}
                  onClick={onBrowseParent}
                >
                  ← 상위 폴더
                </button>
              )}
              <span className={styles.fileBrowserCurrentPath}>{fileBrowserPath}</span>
            </div>

            <div className={styles.fileBrowserList}>
              {fileBrowserLoading && (
                <div className={styles.fileBrowserLoader}>불러오는 중...</div>
              )}
              {fileBrowserError && (
                <div className={styles.fileBrowserError}>{fileBrowserError}</div>
              )}
              {!fileBrowserLoading && !fileBrowserError && fileBrowserItems.map((item) => (
                <button
                  key={item.path}
                  type="button"
                  className={`${styles.fileBrowserItem} ${item.isDirectory ? styles.fileBrowserDir : styles.fileBrowserFile}`}
                  onClick={() => onBrowseItem(item)}
                >
                  <span className={styles.fileBrowserItemIcon}>{getFileIcon(item.name, item.isDirectory)}</span>
                  <span className={styles.fileBrowserItemName}>{item.name}</span>
                </button>
              ))}
              {!fileBrowserLoading && !fileBrowserError && fileBrowserItems.length === 0 && (
                <div className={styles.fileBrowserEmpty}>비어있는 디렉토리</div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
