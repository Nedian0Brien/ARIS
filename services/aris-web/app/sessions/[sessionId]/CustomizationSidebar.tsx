'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Blocks,
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
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { WorkspaceFileEditor } from '@/components/files/WorkspaceFileEditor';
import type { GitTreeNode } from '@/lib/git/sidebarUi';
import styles from './CustomizationSidebar.module.css';
import { useCustomizationFilesState } from './customization-sidebar/hooks/useCustomizationFilesState';
import { useCustomizationGitState } from './customization-sidebar/hooks/useCustomizationGitState';
import { useCustomizationModalState } from './customization-sidebar/hooks/useCustomizationModalState';
import { useCustomizationOverviewState } from './customization-sidebar/hooks/useCustomizationOverviewState';
import { CustomizationFilesSection } from './customization-sidebar/sections/CustomizationFilesSection';
import { CustomizationGitSection } from './customization-sidebar/sections/CustomizationGitSection';
import { CustomizationOverviewSection } from './customization-sidebar/sections/CustomizationOverviewSection';
import {
  formatBytes,
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
    activeModal,
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
      {isMounted && activeModal && createPortal(
        <div className={styles.modalOverlay} onClick={closeModal}>
          <section
            className={`${styles.modalCard}${activeModalKind === 'file' ? ` ${styles.fileModalCard}` : ''}`}
            onClick={(event) => event.stopPropagation()}
          >
            {activeModalKind === 'file' ? (
              <div className={`${styles.modalBody} ${styles.fileModalBody}`}>
                {activeFileModal ? (
                  fileLoading ? (
                    <div className={styles.loadingState}>
                      <Loader2 size={16} className={styles.rotate} />
                      <p>파일을 불러오는 중입니다.</p>
                    </div>
                  ) : filePreviewBlock ? (
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
                  ) : (
                    <>
                      {fileStatus ? <div className={styles.fileModalStatus}>{fileStatus}</div> : null}
                      <WorkspaceFileEditor
                        fileName={activeFileModal.name}
                        filePath={activeFileModal.path}
                        workspaceRootPath={normalizedWorkspaceRootPath}
                        content={fileContent}
                        requestedLine={selectedFileLine}
                        navigationRequestKey={selectedFileNavigationKey}
                        isSaving={fileSaving}
                        saveDisabled={fileSaving || fileLoading || !fileDirty}
                        canGoBack={fileNavState.canGoBack}
                        canGoForward={fileNavState.canGoForward}
                        className={styles.fileModalEditor}
                        onChange={(nextContent) => {
                          setFileContent(nextContent);
                          setFileDirty(true);
                          setFileStatus(null);
                        }}
                        onSave={() => void handleSaveFile()}
                        onClose={closeModal}
                        onWikilinkClick={(wikilinkPath) => {
                          void (async () => {
                            const pathWithExt = wikilinkPath.includes('.') ? wikilinkPath : `${wikilinkPath}.md`;
                            let resolvedPath: string | null = null;
                            try {
                              const resp = await fetch(
                                `/api/fs/resolve-wikilink?path=${encodeURIComponent(wikilinkPath)}&from=${encodeURIComponent(activeFileModal.path)}`
                              );
                              const data = await resp.json() as { resolvedPath: string | null };
                              resolvedPath = data.resolvedPath;
                            } catch { /* fallback */ }
                            const finalPath = resolvedPath ?? pathWithExt;
                            const name = finalPath.split('/').pop() ?? finalPath;
                            openFileModal(finalPath, name, { pushHistory: true });
                          })();
                        }}
                        onBack={() => {
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
                        }}
                        onForward={() => {
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
                        }}
                      />
                    </>
                  )
                ) : (
                  <div className={styles.emptyState}>
                    <FileText size={18} />
                    <p>편집할 파일을 선택해 주세요.</p>
                  </div>
                )}
              </div>
            ) : (
              <>
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
                    onClick={closeModal}
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
                            onChange={(event) => {
                              setInstructionContent(event.target.value);
                              setInstructionDirty(true);
                              setInstructionStatus(null);
                            }}
                            spellCheck={false}
                          />
                          <div className={styles.actions}>
                            <span className={styles.statusText}>
                              {instructionStatus
                                ?? (instructionDirty ? '저장되지 않은 변경사항 있음' : '변경사항 없음')}
                            </span>
                            <button
                              type="button"
                              className={styles.saveButton}
                              onClick={() => void handleSaveInstruction()}
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
              </>
            )}
          </section>
        </div>,
        document.body,
      )}
      {isMounted && fileActionDialog && createPortal(
        <div className={styles.modalOverlay} onClick={() => setFileActionDialog(null)}>
          <section className={styles.actionDialogCard} onClick={(event) => event.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div>
                <div className={styles.eyebrow}>
                  {fileActionDialog.kind === 'delete' ? <Trash2 size={13} /> : <FolderKanban size={13} />}
                  {fileActionDialog.kind === 'create-file'
                    ? 'New File'
                    : fileActionDialog.kind === 'create-folder'
                      ? 'New Folder'
                      : fileActionDialog.kind === 'rename'
                        ? 'Rename'
                        : 'Delete'}
                </div>
                <h4 className={styles.modalTitle}>
                  {fileActionDialog.kind === 'create-file'
                    ? '새 파일 만들기'
                    : fileActionDialog.kind === 'create-folder'
                      ? '새 폴더 만들기'
                      : fileActionDialog.kind === 'rename'
                        ? `${fileActionDialog.targetName} 이름 변경`
                        : `${fileActionDialog.targetName} 삭제`}
                </h4>
                <p className={styles.modalSubtle}>
                  {'value' in fileActionDialog ? fileActionDialog.targetPath : `삭제 대상: ${fileActionDialog.targetPath}`}
                </p>
              </div>
              <button
                type="button"
                className={styles.modalCloseButton}
                onClick={() => setFileActionDialog(null)}
                aria-label="모달 닫기"
                title="모달 닫기"
              >
                <X size={16} />
              </button>
            </div>
            <div className={styles.actionDialogBody}>
              {'value' in fileActionDialog ? (
                <input
                  autoFocus
                  className={styles.actionDialogInput}
                  value={fileActionDialog.value}
                  onChange={(event) => {
                    setFileActionDialog((current) => (
                      current && 'value' in current
                        ? { ...current, value: event.target.value }
                        : current
                    ));
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      void handleConfirmFileAction();
                    }
                  }}
                  placeholder={fileActionDialog.kind === 'rename' ? '새 이름' : '이름 입력'}
                />
              ) : (
                <p className={styles.actionDialogCopy}>
                  이 작업은 되돌릴 수 없습니다. 정말 삭제하시겠습니까?
                </p>
              )}
              <div className={styles.actionDialogActions}>
                <button
                  type="button"
                  className={styles.pathButton}
                  onClick={() => setFileActionDialog(null)}
                >
                  취소
                </button>
                <button
                  type="button"
                  className={`${styles.pathButton} ${styles.actionDialogConfirm}`}
                  onClick={() => { void handleConfirmFileAction(); }}
                >
                  {fileActionDialog.kind === 'delete' ? '삭제' : '확인'}
                </button>
              </div>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </section>
  );
}
