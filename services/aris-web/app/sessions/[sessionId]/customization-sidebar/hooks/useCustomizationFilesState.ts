import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { copyTextToClipboard } from '@/lib/copyTextToClipboard';
import { getWorkspaceAbsolutePathForCopy, getWorkspaceRelativePathForCopy } from '@/lib/workspacePathCopy';
import type {
  CustomizationModal,
  FileActionDialog,
  FilePathCopyKind,
  FilePreviewBlock,
  WorkspaceFileEntry,
} from '../types';
import {
  getParentWorkspacePath,
  isWorkspacePathWithinRoot,
  joinWorkspacePath,
  normalizeWorkspaceClientPath,
} from '../shared';

type UseCustomizationFilesStateParams = {
  normalizedWorkspaceRootPath: string;
  setActiveModal: React.Dispatch<React.SetStateAction<CustomizationModal>>;
};

export function useCustomizationFilesState({
  normalizedWorkspaceRootPath,
  setActiveModal,
}: UseCustomizationFilesStateParams) {
  const [filesPath, setFilesPath] = useState(normalizedWorkspaceRootPath);
  const [filesParentPath, setFilesParentPath] = useState<string | null>(null);
  const [filesEntries, setFilesEntries] = useState<WorkspaceFileEntry[]>([]);
  const [filesEntriesByPath, setFilesEntriesByPath] = useState<Record<string, WorkspaceFileEntry[]>>({});
  const [filesLoadingByPath, setFilesLoadingByPath] = useState<Record<string, boolean>>({});
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesError, setFilesError] = useState<string | null>(null);
  const [filesErrorByPath, setFilesErrorByPath] = useState<Record<string, string | null>>({});
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, boolean>>({});
  const [filesSearchQuery, setFilesSearchQuery] = useState('');
  const [filesSearchResults, setFilesSearchResults] = useState<WorkspaceFileEntry[] | null>(null);
  const [filesSearchLoading, setFilesSearchLoading] = useState(false);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFileLine, setSelectedFileLine] = useState<number | null>(null);
  const [selectedFileNavigationKey, setSelectedFileNavigationKey] = useState(0);
  const [fileContent, setFileContent] = useState('');
  const [fileLoading, setFileLoading] = useState(false);
  const [fileSaving, setFileSaving] = useState(false);
  const [fileDirty, setFileDirty] = useState(false);
  const [fileStatus, setFileStatus] = useState<string | null>(null);
  const [filePreviewBlock, setFilePreviewBlock] = useState<FilePreviewBlock | null>(null);
  const [fileActionDialog, setFileActionDialog] = useState<FileActionDialog | null>(null);
  const [fileActionMenuPath, setFileActionMenuPath] = useState<string | null>(null);
  const [filePathCopyState, setFilePathCopyState] = useState<{ key: string; status: 'copied' | 'failed' } | null>(null);
  const filePathCopyResetTimerRef = useRef<number | null>(null);
  const fileNavHistoryRef = useRef<string[]>([]);
  const fileNavIndexRef = useRef(-1);
  const [fileNavState, setFileNavState] = useState({ canGoBack: false, canGoForward: false });

  const loadFilesDirectory = useCallback(async (dirPath: string, options?: { focus?: boolean }) => {
    const normalizedDirPath = normalizeWorkspaceClientPath(dirPath);
    const shouldFocus = options?.focus ?? true;

    setFilesLoadingByPath((prev) => ({ ...prev, [normalizedDirPath]: true }));
    setFilesErrorByPath((prev) => ({ ...prev, [normalizedDirPath]: null }));
    if (shouldFocus) {
      setFilesLoading(true);
      setFilesError(null);
    }
    try {
      const response = await fetch(`/api/fs/list?path=${encodeURIComponent(normalizedDirPath)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null) as {
        currentPath?: string;
        parentPath?: string | null;
        directories?: WorkspaceFileEntry[];
        error?: string;
      } | null;
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '파일 목록을 불러오지 못했습니다.');
      }

      const currentPath = normalizeWorkspaceClientPath(data.currentPath ?? normalizedDirPath);
      const parentPath = data.parentPath && isWorkspacePathWithinRoot(data.parentPath, normalizedWorkspaceRootPath)
        ? data.parentPath
        : null;
      const entries = data.directories ?? [];

      setFilesEntriesByPath((prev) => ({ ...prev, [currentPath]: entries }));
      if (shouldFocus) {
        setFilesPath(currentPath);
        setFilesParentPath(parentPath);
        setFilesEntries(entries);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : '파일 목록을 불러오지 못했습니다.';
      setFilesErrorByPath((prev) => ({ ...prev, [normalizedDirPath]: message }));
      if (shouldFocus) {
        setFilesError(message);
      }
    } finally {
      setFilesLoadingByPath((prev) => ({ ...prev, [normalizedDirPath]: false }));
      if (shouldFocus) {
        setFilesLoading(false);
      }
    }
  }, [normalizedWorkspaceRootPath]);

  const searchFiles = useCallback(async (query: string) => {
    setFilesSearchQuery(query);
    setFilesError(null);
    if (!query.trim()) {
      setFilesSearchResults(null);
      return;
    }

    setFilesSearchLoading(true);
    try {
      const response = await fetch(
        `/api/fs/search?q=${encodeURIComponent(query.trim())}&path=${encodeURIComponent(normalizedWorkspaceRootPath)}`,
        { cache: 'no-store' },
      );
      const data = await response.json().catch(() => null) as {
        results?: Array<{ name: string; path: string; isDirectory: boolean }>;
        error?: string;
      } | null;
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '파일 검색에 실패했습니다.');
      }

      setFilesSearchResults((data.results ?? []).map((item) => ({
        ...item,
        isFile: !item.isDirectory,
      })));
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : '파일 검색에 실패했습니다.');
      setFilesSearchResults([]);
    } finally {
      setFilesSearchLoading(false);
    }
  }, [normalizedWorkspaceRootPath]);

  const loadFile = useCallback(async (filePath: string, fileName?: string) => {
    setFileLoading(true);
    setFileStatus(null);
    setFilePreviewBlock(null);
    setSelectedFilePath(filePath);
    setSelectedFileName(fileName ?? filePath.split('/').pop() ?? filePath);
    try {
      const response = await fetch(`/api/fs/read?path=${encodeURIComponent(filePath)}`, { cache: 'no-store' });
      const data = await response.json().catch(() => null) as {
        content?: string;
        sizeBytes?: number;
        blockedReason?: 'binary' | 'large';
        error?: string;
      } | null;
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : '파일을 불러오지 못했습니다.');
      }

      if (data.blockedReason) {
        setFilePreviewBlock({
          reason: data.blockedReason,
          sizeBytes: typeof data.sizeBytes === 'number' ? data.sizeBytes : 0,
        });
        setFileContent('');
        setFileDirty(false);
        return;
      }

      setFileContent(data.content ?? '');
      setFileDirty(false);
    } catch (error) {
      setFileStatus(error instanceof Error ? error.message : '파일을 불러오지 못했습니다.');
      setFileContent('');
    } finally {
      setFileLoading(false);
    }
  }, []);

  const openFileModal = useCallback((
    filePath: string,
    fileName?: string,
    opts?: { pushHistory?: boolean; line?: number | null },
  ) => {
    void loadFile(filePath, fileName);
    setActiveModal({ kind: 'file', id: filePath });
    setSelectedFileLine(opts?.line ?? null);
    setSelectedFileNavigationKey((current) => current + 1);
    if (opts?.pushHistory) {
      const history = fileNavHistoryRef.current;
      const index = fileNavIndexRef.current;
      const trimmed = history.slice(0, index + 1);
      trimmed.push(filePath);
      fileNavHistoryRef.current = trimmed;
      fileNavIndexRef.current = trimmed.length - 1;
      setFileNavState({
        canGoBack: fileNavIndexRef.current > 0,
        canGoForward: false,
      });
    }
  }, [loadFile, setActiveModal]);

  const handleSaveFile = useCallback(async () => {
    if (!selectedFilePath) return;
    setFileSaving(true);
    setFileStatus(null);
    try {
      const response = await fetch('/api/fs/write', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          path: selectedFilePath,
          content: fileContent,
        }),
      });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok || data?.error) {
        throw new Error(typeof data?.error === 'string' ? data.error : '파일을 저장하지 못했습니다.');
      }

      setFileDirty(false);
      setFileStatus('저장됨');
      await loadFilesDirectory(filesPath);
    } catch (error) {
      setFileStatus(error instanceof Error ? error.message : '파일을 저장하지 못했습니다.');
    } finally {
      setFileSaving(false);
    }
  }, [fileContent, filesPath, loadFilesDirectory, selectedFilePath]);

  const refreshFocusedFiles = useCallback(async (extraPaths: string[] = []) => {
    const paths = Array.from(new Set([
      filesPath,
      ...Object.entries(expandedDirectories)
        .filter(([, isExpanded]) => isExpanded)
        .map(([pathKey]) => pathKey),
      ...extraPaths,
    ].filter((value): value is string => Boolean(value))));

    await Promise.all(paths.map((pathKey) => loadFilesDirectory(pathKey, { focus: pathKey === filesPath })));
  }, [expandedDirectories, filesPath, loadFilesDirectory]);

  const handleToggleDirectory = useCallback((dirPath: string) => {
    const normalizedDirPath = normalizeWorkspaceClientPath(dirPath);
    const nextExpanded = !expandedDirectories[normalizedDirPath];
    setExpandedDirectories((prev) => ({ ...prev, [normalizedDirPath]: nextExpanded }));
    if (nextExpanded && !filesEntriesByPath[normalizedDirPath] && !filesLoadingByPath[normalizedDirPath]) {
      void loadFilesDirectory(normalizedDirPath, { focus: false });
    }
  }, [expandedDirectories, filesEntriesByPath, filesLoadingByPath, loadFilesDirectory]);

  const setTransientFilePathCopyState = useCallback((key: string, status: 'copied' | 'failed') => {
    setFilePathCopyState({ key, status });
    if (typeof window === 'undefined') {
      return;
    }
    if (filePathCopyResetTimerRef.current !== null) {
      window.clearTimeout(filePathCopyResetTimerRef.current);
    }
    filePathCopyResetTimerRef.current = window.setTimeout(() => {
      setFilePathCopyState((current) => (current?.key === key ? null : current));
      filePathCopyResetTimerRef.current = null;
    }, 1800);
  }, []);

  const handleCopyFilePath = useCallback(async (targetPath: string, kind: FilePathCopyKind) => {
    const normalizedTargetPath = normalizeWorkspaceClientPath(targetPath);
    const copyKey = `${normalizedTargetPath}:${kind}`;
    const copyValue = kind === 'absolute'
      ? getWorkspaceAbsolutePathForCopy(normalizedTargetPath)
      : getWorkspaceRelativePathForCopy(normalizedTargetPath, normalizedWorkspaceRootPath);

    try {
      await copyTextToClipboard(copyValue);
      setTransientFilePathCopyState(copyKey, 'copied');
      setFilesError(null);
    } catch {
      setTransientFilePathCopyState(copyKey, 'failed');
      setFilesError(kind === 'absolute' ? '절대경로를 복사하지 못했습니다.' : '상대경로를 복사하지 못했습니다.');
    }
  }, [normalizedWorkspaceRootPath, setTransientFilePathCopyState]);

  const handleConfirmFileAction = useCallback(async () => {
    if (!fileActionDialog) {
      return;
    }

    const trimValue = 'value' in fileActionDialog ? fileActionDialog.value.trim() : '';
    if ('value' in fileActionDialog && !trimValue) {
      setFilesError('이름을 입력해 주세요.');
      return;
    }

    try {
      if (fileActionDialog.kind === 'create-file') {
        const nextPath = joinWorkspacePath(fileActionDialog.targetPath, trimValue);
        const response = await fetch('/api/fs/write', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: nextPath, content: '' }),
        });
        const data = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok || data?.error) {
          throw new Error(typeof data?.error === 'string' ? data.error : '파일을 생성하지 못했습니다.');
        }
        await refreshFocusedFiles([fileActionDialog.targetPath]);
        openFileModal(nextPath, trimValue);
      } else if (fileActionDialog.kind === 'create-folder') {
        const nextPath = joinWorkspacePath(fileActionDialog.targetPath, trimValue);
        const response = await fetch('/api/fs/mkdir', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ path: nextPath }),
        });
        const data = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok || data?.error) {
          throw new Error(typeof data?.error === 'string' ? data.error : '폴더를 생성하지 못했습니다.');
        }
        setExpandedDirectories((prev) => ({ ...prev, [fileActionDialog.targetPath]: true }));
        await refreshFocusedFiles([fileActionDialog.targetPath]);
      } else if (fileActionDialog.kind === 'rename') {
        const parentPath = getParentWorkspacePath(fileActionDialog.targetPath) ?? normalizedWorkspaceRootPath;
        const nextPath = joinWorkspacePath(parentPath, trimValue);
        const response = await fetch('/api/fs/move', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPath: fileActionDialog.targetPath, newPath: nextPath }),
        });
        const data = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok || data?.error) {
          throw new Error(typeof data?.error === 'string' ? data.error : '이름을 변경하지 못했습니다.');
        }
        if (filesPath === fileActionDialog.targetPath) {
          setFilesPath(nextPath);
        }
        if (selectedFilePath === fileActionDialog.targetPath) {
          setSelectedFilePath(nextPath);
          setSelectedFileName(trimValue);
        }
        await refreshFocusedFiles([parentPath]);
      } else {
        const response = await fetch(`/api/fs/delete?path=${encodeURIComponent(fileActionDialog.targetPath)}`, {
          method: 'DELETE',
        });
        const data = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok || data?.error) {
          throw new Error(typeof data?.error === 'string' ? data.error : '삭제하지 못했습니다.');
        }
        if (selectedFilePath && (selectedFilePath === fileActionDialog.targetPath || selectedFilePath.startsWith(`${fileActionDialog.targetPath}/`))) {
          setSelectedFilePath(null);
          setSelectedFileName(null);
          setActiveModal(null);
        }
        await refreshFocusedFiles([getParentWorkspacePath(fileActionDialog.targetPath) ?? filesPath]);
      }

      setFileActionDialog(null);
      setFilesError(null);
    } catch (error) {
      setFilesError(error instanceof Error ? error.message : '파일 작업을 완료하지 못했습니다.');
    }
  }, [fileActionDialog, filesPath, normalizedWorkspaceRootPath, openFileModal, refreshFocusedFiles, selectedFilePath, setActiveModal]);

  useEffect(() => {
    setFilesPath(normalizedWorkspaceRootPath);
    setFilesParentPath(null);
    setFilesEntries([]);
    setFilesEntriesByPath({});
    setFilesErrorByPath({});
    setFilesLoadingByPath({});
    setExpandedDirectories({});
    setFilesSearchQuery('');
    setFilesSearchResults(null);
  }, [normalizedWorkspaceRootPath]);

  useEffect(() => {
    if (fileActionDialog) {
      return;
    }

    if (filePathCopyResetTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(filePathCopyResetTimerRef.current);
      filePathCopyResetTimerRef.current = null;
    }
  }, [fileActionDialog]);

  useEffect(() => {
    if (!fileActionMenuPath) {
      return;
    }

    const handlePointerDown = () => {
      setFileActionMenuPath(null);
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
    };
  }, [fileActionMenuPath]);

  useEffect(() => () => {
    if (filePathCopyResetTimerRef.current !== null && typeof window !== 'undefined') {
      window.clearTimeout(filePathCopyResetTimerRef.current);
    }
  }, []);

  const visibleFiles = useMemo(
    () => filesSearchResults ?? (filesEntriesByPath[filesPath] ?? filesEntries),
    [filesEntries, filesEntriesByPath, filesPath, filesSearchResults],
  );

  return {
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
    filesEntries,
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
    loadFile,
    loadFilesDirectory,
    openFileModal,
    refreshFocusedFiles,
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
    setFilesError,
    setFilesPath,
    setFilesSearchQuery,
    setFilesSearchResults,
    setSelectedFileName,
    setSelectedFilePath,
    visibleFiles,
  };
}
