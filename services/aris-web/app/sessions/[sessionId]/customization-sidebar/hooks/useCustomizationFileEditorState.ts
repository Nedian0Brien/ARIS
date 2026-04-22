'use client';

import { useCallback, useRef, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { CustomizationModal, FilePreviewBlock } from '../types';

type Params = {
  filesPath: string;
  loadFilesDirectory: (dirPath: string, options?: { focus?: boolean }) => Promise<void>;
  setActiveModal: Dispatch<SetStateAction<CustomizationModal>>;
};

export function useCustomizationFileEditorState({
  filesPath,
  loadFilesDirectory,
  setActiveModal,
}: Params) {
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
  const fileNavHistoryRef = useRef<string[]>([]);
  const fileNavIndexRef = useRef(-1);
  const [fileNavState, setFileNavState] = useState({ canGoBack: false, canGoForward: false });

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

  const openFile = useCallback((
    filePath: string,
    fileName?: string,
    opts?: { pushHistory?: boolean; line?: number | null; activateModal?: boolean },
  ) => {
    void loadFile(filePath, fileName);
    setSelectedFileLine(opts?.line ?? null);
    setSelectedFileNavigationKey((current) => current + 1);
    if (opts?.activateModal) {
      setActiveModal({ kind: 'file', id: filePath });
    }
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

  const openFileModal = useCallback((
    filePath: string,
    fileName?: string,
    opts?: { pushHistory?: boolean; line?: number | null },
  ) => {
    openFile(filePath, fileName, {
      ...opts,
      activateModal: true,
    });
  }, [openFile]);

  const closeFile = useCallback(() => {
    setSelectedFilePath(null);
    setSelectedFileName(null);
    setSelectedFileLine(null);
    setFileContent('');
    setFileDirty(false);
    setFileStatus(null);
    setFilePreviewBlock(null);
  }, []);

  const handleSaveFile = useCallback(async () => {
    if (!selectedFilePath) {
      return;
    }
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

  return {
    fileContent,
    fileDirty,
    fileLoading,
    fileNavHistoryRef,
    fileNavIndexRef,
    fileNavState,
    filePreviewBlock,
    fileSaving,
    fileStatus,
    closeFile,
    handleSaveFile,
    loadFile,
    openFile,
    openFileModal,
    selectedFileLine,
    selectedFileName,
    selectedFileNavigationKey,
    selectedFilePath,
    setFileContent,
    setFileDirty,
    setFileNavState,
    setFileStatus,
    setSelectedFileName,
    setSelectedFilePath,
  };
}
