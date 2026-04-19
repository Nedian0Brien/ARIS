'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { copyTextToClipboard } from '@/lib/copyTextToClipboard';
import { getWorkspaceAbsolutePathForCopy, getWorkspaceRelativePathForCopy } from '@/lib/workspacePathCopy';
import type {
  CustomizationModal,
  FileActionDialog,
  FilePathCopyKind,
} from '../types';
import {
  getParentWorkspacePath,
  joinWorkspacePath,
  normalizeWorkspaceClientPath,
} from '../shared';

type Params = {
  filesPath: string;
  normalizedWorkspaceRootPath: string;
  openFileModal: (filePath: string, fileName?: string, opts?: { pushHistory?: boolean; line?: number | null }) => void;
  refreshFocusedFiles: (extraPaths?: string[]) => Promise<void>;
  selectedFilePath: string | null;
  setActiveModal: Dispatch<SetStateAction<CustomizationModal>>;
  setExpandedDirectories: Dispatch<SetStateAction<Record<string, boolean>>>;
  setFilesError: Dispatch<SetStateAction<string | null>>;
  setFilesPath: Dispatch<SetStateAction<string>>;
  setSelectedFileName: Dispatch<SetStateAction<string | null>>;
  setSelectedFilePath: Dispatch<SetStateAction<string | null>>;
};

export function useCustomizationFileActionState({
  filesPath,
  normalizedWorkspaceRootPath,
  openFileModal,
  refreshFocusedFiles,
  selectedFilePath,
  setActiveModal,
  setExpandedDirectories,
  setFilesError,
  setFilesPath,
  setSelectedFileName,
  setSelectedFilePath,
}: Params) {
  const [fileActionDialog, setFileActionDialog] = useState<FileActionDialog | null>(null);
  const [fileActionMenuPath, setFileActionMenuPath] = useState<string | null>(null);
  const [filePathCopyState, setFilePathCopyState] = useState<{ key: string; status: 'copied' | 'failed' } | null>(null);
  const filePathCopyResetTimerRef = useRef<number | null>(null);

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
  }, [normalizedWorkspaceRootPath, setFilesError, setTransientFilePathCopyState]);

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
        if (
          selectedFilePath
          && (
            selectedFilePath === fileActionDialog.targetPath
            || selectedFilePath.startsWith(`${fileActionDialog.targetPath}/`)
          )
        ) {
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
  }, [
    fileActionDialog,
    filesPath,
    normalizedWorkspaceRootPath,
    openFileModal,
    refreshFocusedFiles,
    selectedFilePath,
    setActiveModal,
    setExpandedDirectories,
    setFilesError,
    setFilesPath,
    setSelectedFileName,
    setSelectedFilePath,
  ]);

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

  return {
    fileActionDialog,
    fileActionMenuPath,
    filePathCopyState,
    handleConfirmFileAction,
    handleCopyFilePath,
    setFileActionDialog,
    setFileActionMenuPath,
  };
}
