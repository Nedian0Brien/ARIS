'use client';

import React from 'react';
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
  GitBranch,
  Loader2,
  MoreVertical,
  Pencil,
  PlugZap,
  RefreshCw,
  Trash2,
  X,
} from 'lucide-react';
import type { GitTreeNode } from '@/lib/git/sidebarUi';
import { WorkspaceFileEditor } from '@/components/files/WorkspaceFileEditor';
import legacyStyles from '../CustomizationSidebar.module.css';
import styles from './WorkspaceShell.module.css';
import { useCustomizationFilesState } from '../customization-sidebar/hooks/useCustomizationFilesState';
import { useCustomizationGitState } from '../customization-sidebar/hooks/useCustomizationGitState';
import { useCustomizationModalState } from '../customization-sidebar/hooks/useCustomizationModalState';
import { useCustomizationOverviewState } from '../customization-sidebar/hooks/useCustomizationOverviewState';
import { CustomizationFileActionDialog } from '../customization-sidebar/modals/CustomizationFileActionDialog';
import { CustomizationFileModal } from '../customization-sidebar/modals/CustomizationFileModal';
import { CustomizationFilesSection } from '../customization-sidebar/sections/CustomizationFilesSection';
import {
  formatGitStatusLabel,
  getGitFileName,
  getGitParentLabel,
  getParentWorkspacePath,
  gitTreeExpansionKey,
  normalizeWorkspaceClientPath,
} from '../customization-sidebar/shared';
import type {
  CustomizationSection,
  GitDiffScope,
  GitFileEntry,
  RequestedFilePayload,
  WorkspaceFileEntry,
} from '../customization-sidebar/types';
import { WorkspaceContextPane } from './WorkspaceContextPane';
import { WorkspaceFilesPane } from './WorkspaceFilesPane';
import { WorkspaceGitPane } from './WorkspaceGitPane';

type WorkspaceMode = 'files' | 'git' | 'context';

type Props = {
  sessionId: string;
  projectName: string;
  workspaceRootPath: string;
  requestedFile?: RequestedFilePayload | null;
  mode?: 'desktop' | 'mobile';
  onRequestClose?: () => void;
};

const MODE_ITEMS: Array<{
  id: WorkspaceMode;
  label: string;
  subtitle: string;
  Icon: typeof FolderKanban;
}> = [
  { id: 'files', label: 'Files', subtitle: '탐색과 인라인 편집', Icon: FolderKanban },
  { id: 'git', label: 'Git', subtitle: '변경 확인과 커밋', Icon: GitBranch },
  { id: 'context', label: 'Context', subtitle: 'AGENTS · Skills · MCP', Icon: PlugZap },
];

export function WorkspaceShell({
  sessionId,
  projectName,
  workspaceRootPath = '/',
  requestedFile = null,
  mode = 'desktop',
  onRequestClose,
}: Props) {
  const isMobileLayout = mode === 'mobile';
  const normalizedWorkspaceRootPath = useMemo(
    () => normalizeWorkspaceClientPath(workspaceRootPath),
    [workspaceRootPath],
  );
  const [activeMode, setActiveMode] = useState<WorkspaceMode>('files');
  const [selectedMcpId, setSelectedMcpId] = useState<string | null>(null);
  const {
    activeModalKind,
    closeModal,
    isMounted,
    setActiveModal,
  } = useCustomizationModalState();
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
    setSelectedGitDiffScope,
    stagedGitFiles,
    toggleGitFolder,
    workingGitFiles,
  } = useCustomizationGitState({
    activeSurface: activeMode,
    sessionId,
  });
  const {
    closeFile,
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
    openFile,
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
  const handledRequestedFileNonceRef = useRef<number | null>(null);

  const selectedMcp = useMemo(
    () => overview?.mcpServers.find((server) => server.id === selectedMcpId) ?? null,
    [overview, selectedMcpId],
  );

  useEffect(() => {
    if (gitOverview || gitLoading || gitErrorDetails) {
      return;
    }
    void loadGitOverview();
  }, [gitErrorDetails, gitLoading, gitOverview, loadGitOverview]);

  useEffect(() => {
    if (!overview?.mcpServers.length) {
      setSelectedMcpId(null);
      return;
    }

    setSelectedMcpId((current) => (
      current && overview.mcpServers.some((server) => server.id === current)
        ? current
        : overview.mcpServers[0]?.id ?? null
    ));
  }, [overview]);

  const openWorkspaceFile = useCallback((
    filePath: string,
    fileName?: string,
    opts?: { pushHistory?: boolean; line?: number | null },
  ) => {
    if (!isMobileLayout) {
      closeModal();
      openFile(filePath, fileName, opts);
      return;
    }

    openFileModal(filePath, fileName, opts);
  }, [closeModal, isMobileLayout, openFile, openFileModal]);

  useEffect(() => {
    if (!requestedFile || handledRequestedFileNonceRef.current === requestedFile.nonce) {
      return;
    }

    handledRequestedFileNonceRef.current = requestedFile.nonce;
    setActiveMode('files');
    setFilesSearchQuery('');
    setFilesSearchResults(null);
    setExpandedDirectories({});
    const nextParentPath = getParentWorkspacePath(requestedFile.path) ?? normalizedWorkspaceRootPath;
    void loadFilesDirectory(nextParentPath);
    openWorkspaceFile(requestedFile.path, requestedFile.name, {
      line: requestedFile.line ?? null,
    });
  }, [
    loadFilesDirectory,
    normalizedWorkspaceRootPath,
    openWorkspaceFile,
    requestedFile,
    setExpandedDirectories,
    setFilesSearchQuery,
    setFilesSearchResults,
  ]);

  useEffect(() => {
    if (activeMode !== 'files' || filesSearchQuery.trim()) {
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
    activeMode,
    filesEntriesByPath,
    filesLoadingByPath,
    filesPath,
    filesSearchQuery,
    loadFilesDirectory,
  ]);

  const renderFileTree = useCallback((entries: WorkspaceFileEntry[], depth = 0): React.ReactNode => (
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
      const isActiveFile = !item.isDirectory && selectedFilePath === item.path;

      return (
        <div key={item.path} className={legacyStyles.fileTreeBranch}>
          <div className={legacyStyles.fileTreeRow} style={{ paddingLeft: `${depth * 16}px` }}>
            {item.isDirectory ? (
              <button
                type="button"
                className={legacyStyles.fileTreeToggle}
                onClick={() => handleToggleDirectory(item.path)}
                aria-label={isExpanded ? '폴더 접기' : '폴더 펼치기'}
                title={isExpanded ? '폴더 접기' : '폴더 펼치기'}
              >
                {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              </button>
            ) : (
              <span className={legacyStyles.fileTreeSpacer} />
            )}
            <button
              type="button"
              className={`${legacyStyles.fileTreeMain} ${isActiveFile ? styles.fileTreeMainActive : ''}`}
              onClick={() => {
                if (item.isDirectory) {
                  handleToggleDirectory(item.path);
                  return;
                }

                fileNavHistoryRef.current = [item.path];
                fileNavIndexRef.current = 0;
                setFileNavState({ canGoBack: false, canGoForward: false });
                openWorkspaceFile(item.path, item.name);
              }}
            >
              {item.isDirectory
                ? (isExpanded ? <FolderOpen size={14} /> : <Folder size={14} />)
                : <FileText size={14} />}
              <span className={legacyStyles.fileEntryText}>
                <span className={legacyStyles.itemTitle}>{item.name}</span>
                <span className={legacyStyles.itemDescription}>{item.path}</span>
              </span>
            </button>
            <div className={legacyStyles.fileTreeActions} onMouseDown={(event) => event.stopPropagation()}>
              <button
                type="button"
                className={legacyStyles.fileTreeActionButton}
                onClick={(event) => {
                  event.stopPropagation();
                  setFileActionMenuPath((current) => (current === item.path ? null : item.path));
                }}
                title="파일 메뉴"
              >
                <MoreVertical size={13} />
              </button>
              {fileActionMenuPath === item.path ? (
                <div className={legacyStyles.fileTreeMenu}>
                  <button
                    type="button"
                    className={legacyStyles.fileTreeMenuItem}
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
                    className={legacyStyles.fileTreeMenuItem}
                    onClick={() => {
                      void handleCopyFilePath(item.path, 'absolute');
                    }}
                  >
                    <Copy size={13} />
                    {absoluteCopyLabel}
                  </button>
                  <button
                    type="button"
                    className={legacyStyles.fileTreeMenuItem}
                    onClick={() => {
                      void handleCopyFilePath(item.path, 'relative');
                    }}
                  >
                    <Copy size={13} />
                    {relativeCopyLabel}
                  </button>
                  <button
                    type="button"
                    className={`${legacyStyles.fileTreeMenuItem} ${legacyStyles.fileTreeMenuItemDanger}`}
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
            <div className={legacyStyles.fileTreeChildren}>
              {childLoading ? (
                <div className={legacyStyles.fileTreeHint}>
                  <Loader2 size={14} className={legacyStyles.rotate} />
                  <span>폴더를 불러오는 중입니다.</span>
                </div>
              ) : childError ? (
                <div className={`${legacyStyles.fileTreeHint} ${legacyStyles.fileTreeHintError}`}>
                  <AlertTriangle size={14} />
                  <span>{childError}</span>
                </div>
              ) : childEntries.length > 0 ? (
                renderFileTree(childEntries, depth + 1)
              ) : (
                <div className={legacyStyles.fileTreeHint}>
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
    openWorkspaceFile,
    selectedFilePath,
    setFileActionDialog,
    setFileActionMenuPath,
    setFileNavState,
  ]);

  const renderGitTree = useCallback((
    nodes: Array<GitTreeNode<GitFileEntry>>,
    scope: GitDiffScope,
    depth = 0,
  ): React.ReactNode => (
    nodes.map((node) => {
      if (node.kind === 'folder') {
        const expansionKey = gitTreeExpansionKey(scope, node.path);
        const isExpanded = gitExpandedFolders[expansionKey] ?? true;

        return (
          <div key={`${scope}-folder-${node.path}`} className={legacyStyles.gitTreeBranch}>
            <button
              type="button"
              className={legacyStyles.gitFolderRow}
              style={{ paddingLeft: `${0.5 + depth * 0.78}rem` }}
              onClick={() => toggleGitFolder(scope, node.path)}
              aria-label={isExpanded ? `${node.name} 폴더 접기` : `${node.name} 폴더 펼치기`}
            >
              {isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
              {isExpanded ? <FolderOpen size={13} /> : <Folder size={13} />}
              <span className={legacyStyles.gitFolderName}>{node.name}</span>
              <span className={legacyStyles.gitFolderCount}>{node.fileCount}</span>
            </button>
            {isExpanded ? (
              <div className={legacyStyles.gitTreeChildren}>
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
          className={`${legacyStyles.gitFileRow} ${isActive ? legacyStyles.gitFileRowActive : ''}`}
          style={{ paddingLeft: `${0.5 + depth * 0.78}rem` }}
        >
          <button
            type="button"
            className={legacyStyles.gitFileMain}
            onClick={() => selectGitFile(file.path, scope)}
          >
            <span className={`${legacyStyles.gitStatusPill} ${file.conflicted ? legacyStyles.gitStatusPillDanger : file.untracked ? legacyStyles.gitStatusPillWarn : ''}`}>
              {badgeLabel}
            </span>
            <span className={legacyStyles.gitFileCopy}>
              <span className={legacyStyles.itemTitle}>{getGitFileName(file.path)}</span>
              <span className={legacyStyles.itemDescription}>
                {getGitParentLabel(file.path)}
                {' · '}
                {statusLabel}
              </span>
            </span>
          </button>
          <button
            type="button"
            className={legacyStyles.gitInlineActionButton}
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
  ), [
    gitActionBusy,
    gitExpandedFolders,
    runGitAction,
    selectGitFile,
    selectedGitDiffScope,
    selectedGitPath,
    toggleGitFolder,
  ]);

  const gitDiffContent = selectedGitFile ? (
    gitDiffLoading ? (
      <div className={legacyStyles.loadingState}>
        <Loader2 size={16} className={legacyStyles.rotate} />
        <p>diff를 불러오는 중입니다.</p>
      </div>
    ) : gitDiffError ? (
      <div className={legacyStyles.errorState}>
        <AlertTriangle size={18} />
        <p>{gitDiffError}</p>
      </div>
    ) : selectedGitDiffScope === 'working' && selectedGitFile.untracked && !selectedGitFile.staged ? (
      <div className={legacyStyles.gitEmptyState}>새 파일입니다. Stage 하면 diff와 함께 커밋할 수 있습니다.</div>
    ) : gitDiffText && parsedGitDiff.sections.length > 0 ? (
      <div className={legacyStyles.gitDiffViewer}>
        {parsedGitDiff.sections.map((section, sectionIndex) => (
          section.type === 'meta' ? (
            <div key={`meta-${sectionIndex}`} className={legacyStyles.gitDiffMetaBlock}>
              {section.lines.map((line, lineIndex) => (
                <span key={`meta-line-${lineIndex}`} className={legacyStyles.gitDiffMetaLine}>{line || ' '}</span>
              ))}
            </div>
          ) : (
            <section key={`hunk-${sectionIndex}`} className={legacyStyles.gitDiffHunk}>
              <div className={legacyStyles.gitDiffHunkHeader}>
                <span className={legacyStyles.gitDiffHunkAt}>@@</span>
                <span className={legacyStyles.gitDiffHunkRangeOld}>-{section.oldRange}</span>
                <span className={legacyStyles.gitDiffHunkRangeNew}>+{section.newRange}</span>
              </div>
              <div className={legacyStyles.gitDiffCodeTable}>
                {section.lines.map((line, lineIndex) => (
                  <div
                    key={`diff-line-${sectionIndex}-${lineIndex}`}
                    className={[
                      legacyStyles.gitDiffCodeRow,
                      line.type === 'add'
                        ? legacyStyles.gitDiffCodeRowAdd
                        : line.type === 'del'
                          ? legacyStyles.gitDiffCodeRowDel
                          : line.type === 'note'
                            ? legacyStyles.gitDiffCodeRowNote
                            : legacyStyles.gitDiffCodeRowContext,
                    ].join(' ')}
                  >
                    {line.type === 'note' ? (
                      <div className={legacyStyles.gitDiffCodeNote}>{line.content || ' '}</div>
                    ) : (
                      <>
                        <span className={legacyStyles.gitDiffLineNumber}>{line.oldLineNumber ?? ''}</span>
                        <span className={legacyStyles.gitDiffLineNumber}>{line.newLineNumber ?? ''}</span>
                        <span className={legacyStyles.gitDiffLineMarker}>{line.prefix || ' '}</span>
                        <code
                          className={legacyStyles.gitDiffCodeContent}
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
      <div className={legacyStyles.gitEmptyState}>선택한 범위에 표시할 diff가 없습니다.</div>
    )
  ) : (
    <div className={legacyStyles.gitEmptyState}>파일을 선택하면 diff가 표시됩니다.</div>
  );

  const handleInstructionContentChange = useCallback((value: string) => {
    setInstructionContent(value);
    setInstructionDirty(true);
    setInstructionStatus(null);
  }, [setInstructionContent, setInstructionDirty, setInstructionStatus]);

  const handleFileContentChange = useCallback((nextContent: string) => {
    setFileContent(nextContent);
    setFileDirty(true);
    setFileStatus(null);
  }, [setFileContent, setFileDirty, setFileStatus]);

  const handleOpenWikilink = useCallback((wikilinkPath: string, fromPath: string) => {
    void (async () => {
      const pathWithExt = wikilinkPath.includes('.') ? wikilinkPath : `${wikilinkPath}.md`;
      let resolvedPath: string | null = null;
      try {
        const response = await fetch(
          `/api/fs/resolve-wikilink?path=${encodeURIComponent(wikilinkPath)}&from=${encodeURIComponent(fromPath)}`,
        );
        const data = await response.json() as { resolvedPath: string | null };
        resolvedPath = data.resolvedPath;
      } catch {
        // fallback
      }
      const finalPath = resolvedPath ?? pathWithExt;
      const name = finalPath.split('/').pop() ?? finalPath;
      openWorkspaceFile(finalPath, name, { pushHistory: true });
    })();
  }, [openWorkspaceFile]);

  const handleFileBack = useCallback(() => {
    const nextIndex = fileNavIndexRef.current - 1;
    if (nextIndex < 0) {
      return;
    }
    const path = fileNavHistoryRef.current[nextIndex];
    if (!path) {
      return;
    }
    fileNavIndexRef.current = nextIndex;
    setFileNavState({
      canGoBack: nextIndex > 0,
      canGoForward: nextIndex < fileNavHistoryRef.current.length - 1,
    });
    openWorkspaceFile(path, path.split('/').pop() ?? path);
  }, [fileNavHistoryRef, fileNavIndexRef, openWorkspaceFile, setFileNavState]);

  const handleFileForward = useCallback(() => {
    const nextIndex = fileNavIndexRef.current + 1;
    if (nextIndex >= fileNavHistoryRef.current.length) {
      return;
    }
    const path = fileNavHistoryRef.current[nextIndex];
    if (!path) {
      return;
    }
    fileNavIndexRef.current = nextIndex;
    setFileNavState({
      canGoBack: nextIndex > 0,
      canGoForward: nextIndex < fileNavHistoryRef.current.length - 1,
    });
    openWorkspaceFile(path, path.split('/').pop() ?? path);
  }, [fileNavHistoryRef, fileNavIndexRef, openWorkspaceFile, setFileNavState]);

  const handleFileClose = useCallback(() => {
    closeFile();
    closeModal();
  }, [closeFile, closeModal]);

  const refreshCurrentMode = useCallback(() => {
    if (activeMode === 'files') {
      if (filesSearchQuery.trim()) {
        void searchFiles(filesSearchQuery);
      } else {
        void loadFilesDirectory(filesPath);
      }
      return;
    }

    if (activeMode === 'git') {
      void loadGitOverview();
      return;
    }

    void loadOverview();
  }, [
    activeMode,
    filesPath,
    filesSearchQuery,
    loadFilesDirectory,
    loadGitOverview,
    loadOverview,
    searchFiles,
  ]);

  const fileDetailBody = useMemo(() => {
    if (!selectedFilePath) {
      return (
        <div className={styles.workspaceEmptyState}>
          <FileText size={18} />
          <p>파일 링크를 누르거나 좌측 목록에서 선택하면 이 영역에서 바로 열립니다.</p>
        </div>
      );
    }

    if (fileLoading) {
      return (
        <div className={styles.workspaceEmptyState}>
          <Loader2 size={18} className={styles.rotate} />
          <p>파일을 불러오는 중입니다.</p>
        </div>
      );
    }

    if (filePreviewBlock) {
      return (
        <div className={styles.fileDetailBlockedCard}>
          <AlertTriangle size={18} />
          <div className={styles.fileDetailBlockedCopy}>
            <strong>
              {filePreviewBlock.reason === 'binary'
                ? '바이너리 파일은 인라인 미리보기를 지원하지 않습니다.'
                : '큰 파일은 패널 안에서 직접 열지 않습니다.'}
            </strong>
            <span>
              {filePreviewBlock.reason === 'binary'
                ? '텍스트 파일만 인라인 편집과 미리보기를 제공합니다.'
                : '대용량 파일은 로컬 편집기나 전용 도구로 여는 편이 안정적입니다.'}
            </span>
          </div>
        </div>
      );
    }

    return (
      <>
        {fileStatus ? <div className={styles.fileDetailStatus}>{fileStatus}</div> : null}
        <WorkspaceFileEditor
          fileName={selectedFileName ?? selectedFilePath.split('/').pop() ?? selectedFilePath}
          filePath={selectedFilePath}
          workspaceRootPath={normalizedWorkspaceRootPath}
          content={fileContent}
          requestedLine={selectedFileLine}
          navigationRequestKey={selectedFileNavigationKey}
          isSaving={fileSaving}
          saveDisabled={fileSaving || fileLoading || !fileDirty}
          canGoBack={fileNavState.canGoBack}
          canGoForward={fileNavState.canGoForward}
          className={styles.inlineFileEditor}
          onBack={handleFileBack}
          onChange={handleFileContentChange}
          onClose={handleFileClose}
          onForward={handleFileForward}
          onSave={() => {
            void handleSaveFile();
          }}
          onWikilinkClick={(wikilinkPath) => handleOpenWikilink(wikilinkPath, selectedFilePath)}
        />
      </>
    );
  }, [
    fileContent,
    fileDirty,
    fileLoading,
    fileNavState.canGoBack,
    fileNavState.canGoForward,
    filePreviewBlock,
    fileSaving,
    fileStatus,
    handleFileBack,
    handleFileClose,
    handleFileContentChange,
    handleFileForward,
    handleOpenWikilink,
    handleSaveFile,
    normalizedWorkspaceRootPath,
    selectedFileLine,
    selectedFileName,
    selectedFileNavigationKey,
    selectedFilePath,
  ]);

  const currentModeItem = MODE_ITEMS.find((item) => item.id === activeMode) ?? MODE_ITEMS[0];
  const filesCountLabel = filesSearchResults ? `검색 ${visibleFiles.length}개` : `${visibleFiles.length}개`;
  const branchLabel = gitOverview?.branch ?? (gitLoading ? '브랜치 확인 중' : 'Git 정보 없음');
  const branchMeta = gitOverview
    ? `${gitOverview.ahead} ahead · ${gitOverview.behind} behind`
    : 'Git 모드를 열면 변경 사항을 바로 확인할 수 있습니다.';

  return (
    <section className={styles.shellRoot}>
      <header className={styles.shellHeader}>
        <div className={styles.shellHeaderTop}>
          <div className={styles.shellHeaderCopy}>
            <div className={styles.shellEyebrow}>
              <currentModeItem.Icon size={13} />
              Workspace
            </div>
            <h2 className={styles.shellTitle}>Workspace</h2>
            <p className={styles.shellSubtitle}>파일 탐색, 변경 확인, 작업 컨텍스트를 패널 안에서 바로 이어갑니다.</p>
          </div>
          <div className={styles.shellHeaderActions}>
            <button
              type="button"
              className={styles.shellIconButton}
              onClick={refreshCurrentMode}
              aria-label={`${currentModeItem.label} 새로고침`}
              title={`${currentModeItem.label} 새로고침`}
              disabled={
                activeMode === 'files'
                  ? filesLoading || filesSearchLoading
                  : activeMode === 'git'
                    ? gitLoading || gitActionBusy !== null
                    : overviewLoading
              }
            >
              <RefreshCw
                size={15}
                className={
                  activeMode === 'files'
                    ? (filesLoading || filesSearchLoading ? styles.rotate : '')
                    : activeMode === 'git'
                      ? (gitLoading || gitActionBusy !== null ? styles.rotate : '')
                      : (overviewLoading ? styles.rotate : '')
                }
              />
            </button>
            {onRequestClose ? (
              <button
                type="button"
                className={styles.shellIconButton}
                onClick={onRequestClose}
                aria-label="Workspace 닫기"
                title="Workspace 닫기"
              >
                <X size={15} />
              </button>
            ) : null}
          </div>
        </div>

        <div className={styles.shellMetaGrid}>
          <article className={styles.shellMetaCard}>
            <span className={styles.shellMetaLabel}>경로</span>
            <span className={styles.shellMetaValue}>{projectName.split('/').filter(Boolean).pop() ?? projectName}</span>
            <span className={styles.shellMetaHint}>{normalizedWorkspaceRootPath}</span>
          </article>
          <article className={styles.shellMetaCard}>
            <span className={styles.shellMetaLabel}>브랜치</span>
            <span className={styles.shellMetaValue}>{branchLabel}</span>
            <span className={styles.shellMetaHint}>{branchMeta}</span>
          </article>
          <article className={styles.shellMetaCard}>
            <span className={styles.shellMetaLabel}>현재 모드</span>
            <span className={styles.shellMetaValue}>{currentModeItem.label}</span>
            <span className={styles.shellMetaHint}>{currentModeItem.subtitle}</span>
          </article>
        </div>
      </header>

      <div className={styles.shellBody}>
        <nav className={styles.modeRail} aria-label="Workspace mode rail">
          {MODE_ITEMS.map(({ id, Icon, label }) => {
            const isActive = activeMode === id;
            return (
              <button
                key={id}
                type="button"
                className={`${styles.modeRailButton} ${isActive ? styles.modeRailButtonActive : ''}`}
                onClick={() => setActiveMode(id)}
              >
                <Icon size={18} />
                <span className={styles.modeRailLabel}>{label}</span>
              </button>
            );
          })}
        </nav>

        <div className={styles.modePanel}>
          {activeMode === 'files' ? (
            <WorkspaceFilesPane
              detailBody={fileDetailBody}
              detailPath={selectedFilePath}
              detailTitle={selectedFileName ?? 'Inline Editor'}
              isMobileLayout={isMobileLayout}
              navigationBody={(
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
              )}
            />
          ) : activeMode === 'git' ? (
            <WorkspaceGitPane
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
            <WorkspaceContextPane
              activeSection={activeSection}
              instructionContent={instructionContent}
              instructionDirty={instructionDirty}
              instructionLoading={instructionLoading}
              instructionSaving={instructionSaving}
              instructionStatus={instructionStatus}
              overview={overview}
              overviewError={overviewError}
              overviewLoading={overviewLoading}
              selectedInstruction={selectedInstruction}
              selectedInstructionId={selectedInstructionId}
              selectedMcp={selectedMcp}
              selectedMcpId={selectedMcpId}
              selectedSkill={selectedSkill}
              selectedSkillId={selectedSkillId}
              skillContent={skillContent}
              skillError={skillError}
              skillLoading={skillLoading}
              onInstructionChange={handleInstructionContentChange}
              onOpenInstruction={setSelectedInstructionId}
              onOpenSkill={setSelectedSkillId}
              onSaveInstruction={() => {
                void handleSaveInstruction();
              }}
              onSectionChange={(section: CustomizationSection) => {
                setActiveSection(section);
              }}
              onSelectMcp={setSelectedMcpId}
            />
          )}
        </div>
      </div>

      <CustomizationFileModal
        activeFileModal={activeModalKind === 'file' && selectedFilePath
          ? {
            path: selectedFilePath,
            name: selectedFileName ?? selectedFilePath.split('/').pop() ?? selectedFilePath,
          }
          : null}
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
        onBack={handleFileBack}
        onChange={handleFileContentChange}
        onClose={handleFileClose}
        onForward={handleFileForward}
        onOpenWikilink={handleOpenWikilink}
        onSave={() => {
          void handleSaveFile();
        }}
      />

      <CustomizationFileActionDialog
        dialog={fileActionDialog}
        isMounted={isMounted}
        onChangeValue={(value) => {
          setFileActionDialog((current) => (
            current && 'value' in current ? { ...current, value } : current
          ));
        }}
        onClose={() => setFileActionDialog(null)}
        onConfirm={() => {
          void handleConfirmFileAction();
        }}
      />
    </section>
  );
}
