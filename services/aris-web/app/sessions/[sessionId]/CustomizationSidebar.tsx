'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Copy,
  FileText,
  Folder,
  FolderKanban,
  FolderOpen,
  Loader2,
  MoreVertical,
  Pencil,
  Pin,
  PinOff,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type { GitTreeNode } from '@/lib/git/sidebarUi';
import styles from './CustomizationSidebar.module.css';
import { useCustomizationFilesState } from './customization-sidebar/hooks/useCustomizationFilesState';
import { useCustomizationGitState } from './customization-sidebar/hooks/useCustomizationGitState';
import { useCustomizationModalState } from './customization-sidebar/hooks/useCustomizationModalState';
import { useCustomizationOverviewState } from './customization-sidebar/hooks/useCustomizationOverviewState';
import { CustomizationContentModal } from './customization-sidebar/modals/CustomizationContentModal';
import { CustomizationFileActionDialog } from './customization-sidebar/modals/CustomizationFileActionDialog';
import { CustomizationFileModal } from './customization-sidebar/modals/CustomizationFileModal';
import { CustomizationFilesSection } from './customization-sidebar/sections/CustomizationFilesSection';
import { CustomizationGitSection } from './customization-sidebar/sections/CustomizationGitSection';
import { CustomizationOverviewSection } from './customization-sidebar/sections/CustomizationOverviewSection';
import {
  formatGitStatusLabel,
  getGitFileName,
  getGitParentLabel,
  getParentWorkspacePath,
  gitTreeExpansionKey,
  normalizeWorkspaceClientPath,
  SURFACE_COPY,
  SURFACE_ITEMS,
} from './customization-sidebar/shared';
import type {
  CustomizationSidebarProps,
  GitDiffScope,
  GitFileEntry,
  SidebarSurface,
  WorkspaceFileEntry,
} from './customization-sidebar/types';

export function CustomizationSidebar({
  sessionId,
  projectName,
  workspaceRootPath = '/',
  requestedFile = null,
  isPinned = false,
  onTogglePinned,
  mode = 'desktop',
  onRequestClose,
}: CustomizationSidebarProps) {
  const normalizedWorkspaceRootPath = useMemo(
    () => normalizeWorkspaceClientPath(workspaceRootPath),
    [workspaceRootPath],
  );
  const [activeSurface, setActiveSurface] = useState<SidebarSurface>('customization');
  const {
    activeSection,
    handleSaveInstruction,
    instructionContent,
    instructionDirty,
    instructionLoading,
    instructionSaving,
    instructionStatus,
    loadOverview,
    overview,
    overviewError,
    overviewLoading,
    selectedInstruction,
    selectedInstructionId,
    selectedSkill,
    selectedSkillId,
    setActiveSection,
    setInstructionContent,
    setInstructionDirty,
    setInstructionStatus,
    setSelectedInstructionId,
    setSelectedSkillId,
    skillContent,
    skillError,
    skillLoading,
  } = useCustomizationOverviewState({
    sessionId,
  });
  const {
    activeModalKind,
    closeModal,
    isMounted,
    setActiveModal,
  } = useCustomizationModalState();
  const {
    expandedDirectories,
    fileActionDialog,
    fileActionMenuPath,
    fileContent,
    fileDirty,
    fileLoading,
    fileNavHistoryRef,
    fileNavIndexRef,
    fileNavState,
    filePathCopyState,
    filePreviewBlock,
    fileSaving,
    fileStatus,
    filesEntriesByPath,
    filesError,
    filesErrorByPath,
    filesLoading,
    filesLoadingByPath,
    filesParentPath,
    filesPath,
    filesSearchLoading,
    filesSearchQuery,
    filesSearchResults,
    handleConfirmFileAction,
    handleCopyFilePath,
    handleSaveFile,
    handleToggleDirectory,
    loadFilesDirectory,
    openFileModal,
    searchFiles,
    selectedFileLine,
    selectedFileName,
    selectedFileNavigationKey,
    selectedFilePath,
    setExpandedDirectories,
    setFileActionDialog,
    setFileActionMenuPath,
    setFileContent,
    setFileDirty,
    setFileNavState,
    setFileStatus,
    setFilesSearchQuery,
    setFilesSearchResults,
    visibleFiles,
  } = useCustomizationFilesState({
    normalizedWorkspaceRootPath,
    setActiveModal,
  });
  const {
    activeGitFiles,
    activeGitTree,
    gitActionBusy,
    gitActionStatus,
    gitCommitMessage,
    gitDiffError,
    gitDiffLoading,
    gitDiffText,
    gitErrorDetails,
    gitExpandedFolders,
    gitListTab,
    gitLoading,
    gitOverview,
    handleGitListTabChange,
    loadGitOverview,
    parsedGitDiff,
    runGitAction,
    selectGitFile,
    selectedGitDiffScope,
    selectedGitFile,
    selectedGitPath,
    setGitActionStatus,
    setGitCommitMessage,
    setGitDiffError,
    setGitDiffText,
    setGitError,
    setGitExpandedFolders,
    setGitListTab,
    setGitOverview,
    setSelectedGitDiffScope,
    setSelectedGitPath,
    stagedGitFiles,
    toggleGitFolder,
    workingGitFiles,
  } = useCustomizationGitState({
    activeSurface,
    sessionId,
  });
  const handledRequestedFileNonceRef = useRef<number | null>(null);
  const activeInstructionModal = activeModalKind === 'instruction' ? selectedInstruction : null;
  const activeSkillModal = activeModalKind === 'skill' ? selectedSkill : null;
  const activeFileModal = activeModalKind === 'file' && selectedFilePath
    ? { path: selectedFilePath, name: selectedFileName ?? selectedFilePath.split('/').pop() ?? selectedFilePath }
    : null;
  const headerWorkspacePath = overview?.workspacePath ?? gitOverview?.workspacePath ?? projectName;
  const activeSurfaceItem = SURFACE_ITEMS.find((item) => item.id === activeSurface) ?? SURFACE_ITEMS[0];
  const headerCopy = SURFACE_COPY[activeSurface];
  const isMobileMode = mode === 'mobile';

  const openInstructionModal = useCallback((instructionId: string) => {
    setSelectedInstructionId(instructionId);
    setActiveModal({ kind: 'instruction', id: instructionId });
  }, [setActiveModal, setSelectedInstructionId]);
  const openSkillModal = useCallback((skillId: string) => {
    setSelectedSkillId(skillId);
    setActiveModal({ kind: 'skill', id: skillId });
  }, [setActiveModal, setSelectedSkillId]);

  useEffect(() => {
    setGitOverview(null);
    setGitError(null);
    setGitActionStatus(null);
    setGitCommitMessage('');
    setSelectedGitPath(null);
    setGitListTab('working');
    setSelectedGitDiffScope('working');
    setGitExpandedFolders({});
    setGitDiffText('');
    setGitDiffError(null);
  }, [
    normalizedWorkspaceRootPath,
    setGitActionStatus,
    setGitCommitMessage,
    setGitDiffError,
    setGitDiffText,
    setGitError,
    setGitExpandedFolders,
    setGitListTab,
    setGitOverview,
    setSelectedGitDiffScope,
    setSelectedGitPath,
  ]);
  useEffect(() => {
    if (!requestedFile || handledRequestedFileNonceRef.current === requestedFile.nonce) {
      return;
    }

    handledRequestedFileNonceRef.current = requestedFile.nonce;
    const nextParentPath = getParentWorkspacePath(requestedFile.path) ?? normalizedWorkspaceRootPath;
    setActiveSurface('files');
    setFilesSearchQuery('');
    setFilesSearchResults(null);
    setExpandedDirectories({});
    void loadFilesDirectory(nextParentPath);
    openFileModal(requestedFile.path, requestedFile.name, { line: requestedFile.line ?? null });
  }, [
    loadFilesDirectory,
    normalizedWorkspaceRootPath,
    openFileModal,
    requestedFile,
    setExpandedDirectories,
    setFilesSearchQuery,
    setFilesSearchResults,
  ]);
  const filesCountLabel = filesSearchResults ? `검색 ${visibleFiles.length}개` : `${visibleFiles.length}개`;

  useEffect(() => {
    if (activeSurface !== 'files' || filesSearchQuery.trim()) {
      return;
    }

    if (filesLoadingByPath[filesPath]) {
      return;
    }

    if (Object.prototype.hasOwnProperty.call(filesEntriesByPath, filesPath)) {
      return;
    }

    void loadFilesDirectory(filesPath);
  }, [
    activeSurface,
    filesEntriesByPath,
    filesLoadingByPath,
    filesPath,
    filesSearchQuery,
    loadFilesDirectory,
  ]);

  const renderFileTree = useCallback((entries: WorkspaceFileEntry[], depth = 0) => (
    entries.map((item) => {
      const isExpanded = Boolean(expandedDirectories[item.path]);
      const childEntries = filesEntriesByPath[item.path] ?? [];
      const childLoading = Boolean(filesLoadingByPath[item.path]);
      const childError = filesErrorByPath[item.path];
      const absoluteCopyKey = `${item.path}:absolute`;
      const relativeCopyKey = `${item.path}:relative`;
      const absoluteCopyLabel = filePathCopyState?.key === absoluteCopyKey
        ? (filePathCopyState.status === 'copied' ? '절대경로 복사됨' : '절대경로 복사 실패')
        : '절대경로 복사';
      const relativeCopyLabel = filePathCopyState?.key === relativeCopyKey
        ? (filePathCopyState.status === 'copied' ? '상대경로 복사됨' : '상대경로 복사 실패')
        : '상대경로 복사';

      return (
        <div key={item.path} className={styles.fileTreeBranch}>
          <div className={styles.fileTreeRow} style={{ paddingLeft: `${depth * 16}px` }}>
            {item.isDirectory ? (
              <button
                type="button"
                className={styles.fileTreeToggle}
                onClick={() => handleToggleDirectory(item.path)}
                aria-label={isExpanded ? '폴더 접기' : '폴더 펼치기'}
                title={isExpanded ? '폴더 접기' : '폴더 펼치기'}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className={styles.fileTreeSpacer} />
            )}
            <button
              type="button"
              className={styles.fileTreeMain}
              onClick={() => {
                if (item.isDirectory) {
                  handleToggleDirectory(item.path);
                } else {
                  // 파일 목록 직접 클릭: 히스토리 초기화
                  fileNavHistoryRef.current = [item.path];
                  fileNavIndexRef.current = 0;
                  setFileNavState({ canGoBack: false, canGoForward: false });
                  openFileModal(item.path, item.name);
                }
              }}
            >
              {item.isDirectory
                ? (isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />)
                : <FileText size={14} />}
              <span className={styles.fileEntryText}>
                <span className={styles.itemTitle}>{item.name}</span>
                <span className={styles.itemDescription}>{item.path}</span>
              </span>
            </button>
            <div className={styles.fileTreeActions} onMouseDown={(event) => event.stopPropagation()}>
              <button
                type="button"
                className={styles.fileTreeActionButton}
                onClick={(event) => {
                  event.stopPropagation();
                  setFileActionMenuPath((current) => (current === item.path ? null : item.path));
                }}
                title="파일 메뉴"
              >
                <MoreVertical size={13} />
              </button>
              {fileActionMenuPath === item.path ? (
                <div className={styles.fileTreeMenu}>
                  <button
                    type="button"
                    className={styles.fileTreeMenuItem}
                    onClick={() => {
                      setFileActionMenuPath(null);
                      setFileActionDialog({
                        kind: 'rename',
                        targetPath: item.path,
                        targetName: item.name,
                        value: item.name,
                      });
                    }}
                  >
                    <Pencil size={13} />
                    이름 변경
                  </button>
                  <button
                    type="button"
                    className={styles.fileTreeMenuItem}
                    onClick={() => {
                      void handleCopyFilePath(item.path, 'absolute');
                    }}
                  >
                    <Copy size={13} />
                    {absoluteCopyLabel}
                  </button>
                  <button
                    type="button"
                    className={styles.fileTreeMenuItem}
                    onClick={() => {
                      void handleCopyFilePath(item.path, 'relative');
                    }}
                  >
                    <Copy size={13} />
                    {relativeCopyLabel}
                  </button>
                  <button
                    type="button"
                    className={`${styles.fileTreeMenuItem} ${styles.fileTreeMenuItemDanger}`}
                    onClick={() => {
                      setFileActionMenuPath(null);
                      setFileActionDialog({
                        kind: 'delete',
                        targetPath: item.path,
                        targetName: item.name,
                      });
                    }}
                  >
                    <Trash2 size={13} />
                    삭제
                  </button>
                </div>
              ) : null}
            </div>
          </div>
          {item.isDirectory && isExpanded ? (
            <div className={styles.fileTreeChildren}>
              {childLoading ? (
                <div className={styles.fileTreeHint}>
                  <Loader2 size={14} className={styles.rotate} />
                  <span>폴더를 불러오는 중입니다.</span>
                </div>
              ) : childError ? (
                <div className={`${styles.fileTreeHint} ${styles.fileTreeHintError}`}>
                  <AlertTriangle size={14} />
                  <span>{childError}</span>
                </div>
              ) : childEntries.length > 0 ? (
                renderFileTree(childEntries, depth + 1)
              ) : (
                <div className={styles.fileTreeHint}>
                  <FolderKanban size={14} />
                  <span>빈 폴더</span>
                </div>
              )}
            </div>
          ) : null}
        </div>
      );
    })
  ), [
    expandedDirectories,
    fileActionMenuPath,
    fileNavHistoryRef,
    fileNavIndexRef,
    filePathCopyState,
    filesEntriesByPath,
    filesErrorByPath,
    filesLoadingByPath,
    handleCopyFilePath,
    handleToggleDirectory,
    openFileModal,
    setFileActionDialog,
    setFileActionMenuPath,
    setFileNavState,
  ]);
  const renderGitTree = useCallback((
    nodes: Array<GitTreeNode<GitFileEntry>>,
    scope: GitDiffScope,
    depth = 0,
  ) => (
    nodes.map((node) => {
      if (node.kind === 'folder') {
        const expansionKey = gitTreeExpansionKey(scope, node.path);
        const isExpanded = gitExpandedFolders[expansionKey] ?? true;

        return (
          <div key={`${scope}-folder-${node.path}`} className={styles.gitTreeBranch}>
            <button
              type="button"
              className={styles.gitFolderRow}
              style={{ paddingLeft: `${0.5 + depth * 0.78}rem` }}
              onClick={() => toggleGitFolder(scope, node.path)}
              aria-label={isExpanded ? `${node.name} 폴더 접기` : `${node.name} 폴더 펼치기`}
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {isExpanded ? <FolderOpen size={13} /> : <Folder size={13} />}
              <span className={styles.gitFolderName}>{node.name}</span>
              <span className={styles.gitFolderCount}>{node.fileCount}</span>
            </button>
            {isExpanded ? (
              <div className={styles.gitTreeChildren}>
                {renderGitTree(node.children, scope, depth + 1)}
              </div>
            ) : null}
          </div>
        );
      }

      const file = node.file;
      const isWorkingScope = scope === 'working';
      const isActive = selectedGitPath === file.path && selectedGitDiffScope === scope;
      const badgeLabel = file.untracked
        ? '?'
        : isWorkingScope
          ? file.workTreeStatus
          : file.indexStatus;
      const statusLabel = file.originalPath
        ? `${file.originalPath} -> ${file.path}`
        : formatGitStatusLabel(file.untracked ? '?' : isWorkingScope ? file.workTreeStatus : file.indexStatus);

      return (
        <article
          key={`${scope}-${file.path}`}
          className={`${styles.gitFileRow} ${isActive ? styles.gitFileRowActive : ''}`}
          style={{ paddingLeft: `${0.5 + depth * 0.78}rem` }}
        >
          <button
            type="button"
            className={styles.gitFileMain}
            onClick={() => selectGitFile(file.path, scope)}
          >
            <span className={`${styles.gitStatusPill} ${file.conflicted ? styles.gitStatusPillDanger : file.untracked ? styles.gitStatusPillWarn : ''}`}>
              {badgeLabel}
            </span>
            <span className={styles.gitFileCopy}>
              <span className={styles.itemTitle}>{getGitFileName(file.path)}</span>
              <span className={styles.itemDescription}>
                {getGitParentLabel(file.path)}
                {' · '}
                {statusLabel}
              </span>
            </span>
          </button>
          <button
            type="button"
            className={styles.gitInlineActionButton}
            onClick={() => {
              void runGitAction(isWorkingScope ? 'stage' : 'unstage', { paths: [file.path] });
            }}
            disabled={gitActionBusy !== null}
            title={isWorkingScope ? 'Stage' : 'Unstage'}
            aria-label={isWorkingScope ? `${file.path} 스테이징` : `${file.path} 스테이징 해제`}
          >
            {isWorkingScope ? '+' : '-'}
          </button>
        </article>
      );
    })
  ), [gitActionBusy, gitExpandedFolders, runGitAction, selectGitFile, selectedGitDiffScope, selectedGitPath, toggleGitFolder]);

  const gitDiffContent = selectedGitFile ? (
    gitDiffLoading ? (
      <div className={styles.loadingState}>
        <Loader2 size={16} className={styles.rotate} />
        <p>diff를 불러오는 중입니다.</p>
      </div>
    ) : gitDiffError ? (
      <div className={styles.errorState}>
        <AlertTriangle size={18} />
        <p>{gitDiffError}</p>
      </div>
    ) : selectedGitDiffScope === 'working' && selectedGitFile.untracked && !selectedGitFile.staged ? (
      <div className={styles.gitEmptyState}>새 파일입니다. Stage 하면 diff와 함께 커밋할 수 있습니다.</div>
    ) : gitDiffText && parsedGitDiff.sections.length > 0 ? (
      <div className={styles.gitDiffViewer}>
        {parsedGitDiff.sections.map((section, sectionIndex) => (
          section.type === 'meta' ? (
            <div key={`meta-${sectionIndex}`} className={styles.gitDiffMetaBlock}>
              {section.lines.map((line, lineIndex) => (
                <span key={`meta-line-${lineIndex}`} className={styles.gitDiffMetaLine}>{line || ' '}</span>
              ))}
            </div>
          ) : (
            <section key={`hunk-${sectionIndex}`} className={styles.gitDiffHunk}>
              <div className={styles.gitDiffHunkHeader}>
                <span className={styles.gitDiffHunkAt}>@@</span>
                <span className={styles.gitDiffHunkRangeOld}>-{section.oldRange}</span>
                <span className={styles.gitDiffHunkRangeNew}>+{section.newRange}</span>
              </div>
              <div className={styles.gitDiffCodeTable}>
                {section.lines.map((line, lineIndex) => (
                  <div
                    key={`diff-line-${sectionIndex}-${lineIndex}`}
                    className={[
                      styles.gitDiffCodeRow,
                      line.type === 'add'
                        ? styles.gitDiffCodeRowAdd
                        : line.type === 'del'
                          ? styles.gitDiffCodeRowDel
                          : line.type === 'note'
                            ? styles.gitDiffCodeRowNote
                            : styles.gitDiffCodeRowContext,
                    ].join(' ')}
                  >
                    {line.type === 'note' ? (
                      <div className={styles.gitDiffCodeNote}>{line.content || ' '}</div>
                    ) : (
                      <>
                        <span className={styles.gitDiffLineNumber}>{line.oldLineNumber ?? ''}</span>
                        <span className={styles.gitDiffLineNumber}>{line.newLineNumber ?? ''}</span>
                        <span className={styles.gitDiffLineMarker}>{line.prefix || ' '}</span>
                        <code
                          className={styles.gitDiffCodeContent}
                          dangerouslySetInnerHTML={{ __html: line.highlightedHtml || '&nbsp;' }}
                        />
                      </>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )
        ))}
      </div>
    ) : (
      <div className={styles.gitEmptyState}>선택한 범위에 표시할 diff가 없습니다.</div>
    )
  ) : (
    <div className={styles.gitEmptyState}>파일을 선택하면 diff가 표시됩니다.</div>
  );

  const handleInstructionContentChange = useCallback((value: string) => {
    setInstructionContent(value);
    setInstructionDirty(true);
    setInstructionStatus(null);
  }, [setInstructionContent, setInstructionDirty, setInstructionStatus]);

  const handleFileModalChange = useCallback((nextContent: string) => {
    setFileContent(nextContent);
    setFileDirty(true);
    setFileStatus(null);
  }, [setFileContent, setFileDirty, setFileStatus]);

  const handleFileActionDialogValueChange = useCallback((value: string) => {
    setFileActionDialog((current) => (
      current && 'value' in current ? { ...current, value } : current
    ));
  }, [setFileActionDialog]);

  const handleOpenWikilink = useCallback((wikilinkPath: string, fromPath: string) => {
    void (async () => {
      const pathWithExt = wikilinkPath.includes('.') ? wikilinkPath : `${wikilinkPath}.md`;
      let resolvedPath: string | null = null;
      try {
        const resp = await fetch(
          `/api/fs/resolve-wikilink?path=${encodeURIComponent(wikilinkPath)}&from=${encodeURIComponent(fromPath)}`,
        );
        const data = await resp.json() as { resolvedPath: string | null };
        resolvedPath = data.resolvedPath;
      } catch {
        // fallback to the wikilink path with markdown extension
      }
      const finalPath = resolvedPath ?? pathWithExt;
      const name = finalPath.split('/').pop() ?? finalPath;
      openFileModal(finalPath, name, { pushHistory: true });
    })();
  }, [openFileModal]);

  const handleFileModalBack = useCallback(() => {
    const idx = fileNavIndexRef.current - 1;
    if (idx < 0) return;
    const path = fileNavHistoryRef.current[idx];
    if (!path) return;
    fileNavIndexRef.current = idx;
    setFileNavState({
      canGoBack: idx > 0,
      canGoForward: idx < fileNavHistoryRef.current.length - 1,
    });
    openFileModal(path, path.split('/').pop() ?? path);
  }, [fileNavHistoryRef, fileNavIndexRef, openFileModal, setFileNavState]);

  const handleFileModalForward = useCallback(() => {
    const idx = fileNavIndexRef.current + 1;
    if (idx >= fileNavHistoryRef.current.length) return;
    const path = fileNavHistoryRef.current[idx];
    if (!path) return;
    fileNavIndexRef.current = idx;
    setFileNavState({
      canGoBack: idx > 0,
      canGoForward: idx < fileNavHistoryRef.current.length - 1,
    });
    openFileModal(path, path.split('/').pop() ?? path);
  }, [fileNavHistoryRef, fileNavIndexRef, openFileModal, setFileNavState]);

  return (
    <section className={`${styles.sidebarRoot} ${isMobileMode ? styles.sidebarRootMobile : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerTop}>
          <div>
            <div className={styles.eyebrow}>
              <activeSurfaceItem.Icon size={13} />
              {activeSurfaceItem.label}
            </div>
            <h3 className={styles.title}>{headerCopy.title}</h3>
            <p className={styles.subtle}>{headerCopy.subtle}</p>
          </div>
          <div className={styles.headerActions}>
            {!isMobileMode && onTogglePinned ? (
              <button
                type="button"
                className={`${styles.refreshButton} ${isPinned ? styles.pinButtonActive : ''}`}
                onMouseDown={(event) => {
                  event.preventDefault();
                }}
                onClick={(event) => {
                  event.currentTarget.blur();
                  onTogglePinned();
                }}
                aria-label={isPinned ? '우측 사이드바 고정 해제' : '우측 사이드바 고정'}
                title={isPinned ? '우측 사이드바 고정 해제' : '우측 사이드바 고정'}
              >
                {isPinned ? <PinOff size={15} /> : <Pin size={15} />}
              </button>
            ) : null}
            <button
              type="button"
              className={styles.refreshButton}
              onClick={() => {
                if (activeSurface === 'files') {
                  if (filesSearchQuery.trim()) {
                    void searchFiles(filesSearchQuery);
                  } else {
                    void loadFilesDirectory(filesPath);
                  }
                  return;
                }
                if (activeSurface === 'git') {
                  void loadGitOverview();
                  return;
                }
                void loadOverview();
              }}
              disabled={
                activeSurface === 'files'
                  ? filesLoading || filesSearchLoading
                  : activeSurface === 'git'
                    ? gitLoading || gitActionBusy !== null
                    : overviewLoading
              }
              aria-label={`${activeSurfaceItem.label} 새로고침`}
              title={`${activeSurfaceItem.label} 새로고침`}
            >
              <RefreshCw
                size={15}
                className={
                  activeSurface === 'files'
                    ? (filesLoading || filesSearchLoading ? styles.rotate : '')
                    : activeSurface === 'git'
                      ? (gitLoading || gitActionBusy !== null ? styles.rotate : '')
                      : (overviewLoading ? styles.rotate : '')
                }
              />
            </button>
            {onRequestClose ? (
              <button
                type="button"
                className={styles.closeButton}
                onClick={onRequestClose}
                aria-label="Customization 패널 닫기"
                title="Customization 패널 닫기"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
        </div>

        <span className={styles.workspacePath}>{headerWorkspacePath}</span>

        <div className={styles.surfaceTabs}>
          {SURFACE_ITEMS.map(({ id, label, hint, Icon, disabled }) => {
            const isActive = activeSurface === id;
            return (
              <button
                key={id}
                type="button"
                className={`${styles.surfaceTab} ${isActive ? styles.surfaceTabActive : ''} ${disabled ? styles.surfaceTabDisabled : ''}`}
                onClick={() => {
                  if (!disabled) {
                    setActiveSurface(id);
                  }
                }}
                disabled={disabled}
              >
                <Icon size={14} />
                <span className={styles.surfaceTabLabel}>{label}</span>
                <span className={styles.surfaceTabHint}>{hint}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className={styles.body}>
        {activeSurface === 'customization' ? (
          <CustomizationOverviewSection
            activeSection={activeSection}
            overview={overview}
            overviewLoading={overviewLoading}
            overviewError={overviewError}
            selectedInstructionId={selectedInstructionId}
            selectedSkillId={selectedSkillId}
            onOpenInstruction={openInstructionModal}
            onOpenSkill={openSkillModal}
            onSectionChange={setActiveSection}
          />
        ) : activeSurface === 'files' ? (
          <CustomizationFilesSection
            filesCountLabel={filesCountLabel}
            filesError={filesError}
            filesLoading={filesLoading}
            filesPath={filesPath}
            filesParentPath={filesParentPath}
            filesSearchLoading={filesSearchLoading}
            filesSearchQuery={filesSearchQuery}
            hasSearchResults={filesSearchResults !== null}
            normalizedWorkspaceRootPath={normalizedWorkspaceRootPath}
            renderedTree={renderFileTree(visibleFiles)}
            visibleFilesLength={visibleFiles.length}
            onCreateFile={() => {
              setFileActionDialog({ kind: 'create-file', targetPath: filesPath, value: '' });
            }}
            onCreateFolder={() => {
              setFileActionDialog({ kind: 'create-folder', targetPath: filesPath, value: '' });
            }}
            onGoRoot={() => {
              setExpandedDirectories({});
              void loadFilesDirectory(normalizedWorkspaceRootPath);
            }}
            onGoParent={() => {
              if (filesParentPath) {
                void loadFilesDirectory(filesParentPath);
              }
            }}
            onSearchChange={(value) => {
              void searchFiles(value);
            }}
          />
        ) : activeSurface === 'git' ? (
          <CustomizationGitSection
            activeGitFilesLength={activeGitFiles.length}
            activeGitTree={renderGitTree(activeGitTree, gitListTab)}
            gitActionBusy={gitActionBusy}
            gitActionStatus={gitActionStatus}
            gitCommitMessage={gitCommitMessage}
            gitDiffContent={gitDiffContent}
            gitErrorDetails={gitErrorDetails}
            gitListTab={gitListTab}
            gitLoading={gitLoading}
            gitOverview={gitOverview}
            selectedGitDiffScope={selectedGitDiffScope}
            selectedGitFile={selectedGitFile}
            stagedGitFilesLength={stagedGitFiles.length}
            workingGitFilesLength={workingGitFiles.length}
            onCommit={() => {
              void runGitAction('commit', { message: gitCommitMessage });
            }}
            onCommitMessageChange={(value) => {
              setGitCommitMessage(value);
              setGitActionStatus(null);
            }}
            onFetch={() => {
              void runGitAction('fetch');
            }}
            onListTabChange={handleGitListTabChange}
            onPull={() => {
              void runGitAction('pull');
            }}
            onPush={() => {
              void runGitAction('push');
            }}
            onRetry={() => {
              void loadGitOverview();
            }}
            onScopeChange={setSelectedGitDiffScope}
            onStageToggleAll={() => {
              void runGitAction(gitListTab === 'working' ? 'stage' : 'unstage');
            }}
          />
        ) : (
          <div className={styles.content}>
            <div className={styles.emptyState}>
              <FolderKanban size={18} />
              <p>이 패널은 다음 구현 단계에서 연결됩니다.</p>
            </div>
          </div>
        )}
      </div>
      <CustomizationFileModal
        activeFileModal={activeModalKind === 'file' ? activeFileModal : null}
        fileContent={fileContent}
        fileDirty={fileDirty}
        fileLoading={fileLoading}
        fileNavState={fileNavState}
        filePreviewBlock={filePreviewBlock}
        fileSaving={fileSaving}
        fileStatus={fileStatus}
        isMounted={isMounted}
        navigationRequestKey={selectedFileNavigationKey}
        requestedLine={selectedFileLine}
        workspaceRootPath={normalizedWorkspaceRootPath}
        onBack={handleFileModalBack}
        onChange={handleFileModalChange}
        onClose={closeModal}
        onForward={handleFileModalForward}
        onOpenWikilink={handleOpenWikilink}
        onSave={() => {
          void handleSaveFile();
        }}
      />
      <CustomizationContentModal
        activeInstructionModal={activeInstructionModal}
        activeModalKind={activeModalKind}
        activeSkillModal={activeSkillModal}
        instructionContent={instructionContent}
        instructionDirty={instructionDirty}
        instructionLoading={instructionLoading}
        instructionSaving={instructionSaving}
        instructionStatus={instructionStatus}
        isMounted={isMounted}
        skillContent={skillContent}
        skillError={skillError}
        skillLoading={skillLoading}
        onChangeInstruction={handleInstructionContentChange}
        onClose={closeModal}
        onSaveInstruction={() => {
          void handleSaveInstruction();
        }}
      />
      <CustomizationFileActionDialog
        dialog={fileActionDialog}
        isMounted={isMounted}
        onChangeValue={handleFileActionDialogValueChange}
        onClose={() => setFileActionDialog(null)}
        onConfirm={() => {
          void handleConfirmFileAction();
        }}
      />
    </section>
  );
}
