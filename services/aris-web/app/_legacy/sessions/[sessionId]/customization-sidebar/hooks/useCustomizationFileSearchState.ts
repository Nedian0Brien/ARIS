'use client';

import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { WorkspaceFileEntry } from '../types';

type Params = {
  normalizedWorkspaceRootPath: string;
  setFilesError: Dispatch<SetStateAction<string | null>>;
};

export function useCustomizationFileSearchState({
  normalizedWorkspaceRootPath,
  setFilesError,
}: Params) {
  const [filesSearchQuery, setFilesSearchQuery] = useState('');
  const [filesSearchResults, setFilesSearchResults] = useState<WorkspaceFileEntry[] | null>(null);
  const [filesSearchLoading, setFilesSearchLoading] = useState(false);

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
  }, [normalizedWorkspaceRootPath, setFilesError]);

  const resetFileSearchState = useCallback(() => {
    setFilesSearchQuery('');
    setFilesSearchResults(null);
  }, []);

  return {
    filesSearchLoading,
    filesSearchQuery,
    filesSearchResults,
    resetFileSearchState,
    searchFiles,
    setFilesSearchQuery,
    setFilesSearchResults,
  };
}
