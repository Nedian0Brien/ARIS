'use client';

import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { WorkspaceFileEntry } from '../types';
import {
  isWorkspacePathWithinRoot,
  normalizeWorkspaceClientPath,
} from '../shared';

type Params = {
  normalizedWorkspaceRootPath: string;
  setFilesError: Dispatch<SetStateAction<string | null>>;
};

export function useCustomizationFileTreeState({
  normalizedWorkspaceRootPath,
  setFilesError,
}: Params) {
  const [filesPath, setFilesPath] = useState(normalizedWorkspaceRootPath);
  const [filesParentPath, setFilesParentPath] = useState<string | null>(null);
  const [filesEntries, setFilesEntries] = useState<WorkspaceFileEntry[]>([]);
  const [filesEntriesByPath, setFilesEntriesByPath] = useState<Record<string, WorkspaceFileEntry[]>>({});
  const [filesLoadingByPath, setFilesLoadingByPath] = useState<Record<string, boolean>>({});
  const [filesLoading, setFilesLoading] = useState(false);
  const [filesErrorByPath, setFilesErrorByPath] = useState<Record<string, string | null>>({});
  const [expandedDirectories, setExpandedDirectories] = useState<Record<string, boolean>>({});

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
  }, [normalizedWorkspaceRootPath, setFilesError]);

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

  const resetFileTreeState = useCallback(() => {
    setFilesPath(normalizedWorkspaceRootPath);
    setFilesParentPath(null);
    setFilesEntries([]);
    setFilesEntriesByPath({});
    setFilesErrorByPath({});
    setFilesLoadingByPath({});
    setExpandedDirectories({});
  }, [normalizedWorkspaceRootPath]);

  return {
    expandedDirectories,
    filesEntries,
    filesEntriesByPath,
    filesErrorByPath,
    filesLoading,
    filesLoadingByPath,
    filesParentPath,
    filesPath,
    handleToggleDirectory,
    loadFilesDirectory,
    refreshFocusedFiles,
    resetFileTreeState,
    setExpandedDirectories,
    setFilesPath,
  };
}
