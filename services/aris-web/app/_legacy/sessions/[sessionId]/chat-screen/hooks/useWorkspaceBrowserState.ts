import { useEffect, useMemo, useState } from 'react';
import type { SidebarFileRequest } from '../types';
import { normalizeWorkspaceClientPath } from '../helpers';

type FileBrowserItem = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
};

type FileBrowserSearchResult = {
  name: string;
  path: string;
  isDirectory: boolean;
};

type UseWorkspaceBrowserStateParams = {
  workspaceRootPath: string;
};

export function useWorkspaceBrowserState({
  workspaceRootPath,
}: UseWorkspaceBrowserStateParams) {
  const normalizedWorkspaceRootPath = useMemo(
    () => normalizeWorkspaceClientPath(workspaceRootPath),
    [workspaceRootPath],
  );
  const [fileBrowserPath, setFileBrowserPath] = useState(normalizedWorkspaceRootPath);
  const [fileBrowserItems, setFileBrowserItems] = useState<FileBrowserItem[]>([]);
  const [fileBrowserParentPath, setFileBrowserParentPath] = useState<string | null>(null);
  const [fileBrowserLoading, setFileBrowserLoading] = useState(false);
  const [fileBrowserError, setFileBrowserError] = useState<string | null>(null);
  const [fileBrowserQuery, setFileBrowserQuery] = useState('');
  const [fileBrowserSearchResults, setFileBrowserSearchResults] = useState<FileBrowserSearchResult[] | null>(null);
  const [fileBrowserSearchLoading, setFileBrowserSearchLoading] = useState(false);
  const [recentAttachments, setRecentAttachments] = useState<string[]>([]);
  const [sidebarFileRequest, setSidebarFileRequest] = useState<SidebarFileRequest | null>(null);

  useEffect(() => {
    setFileBrowserPath(normalizedWorkspaceRootPath);
  }, [normalizedWorkspaceRootPath]);

  return {
    fileBrowserError,
    fileBrowserItems,
    fileBrowserLoading,
    fileBrowserParentPath,
    fileBrowserPath,
    fileBrowserQuery,
    fileBrowserSearchLoading,
    fileBrowserSearchResults,
    normalizedWorkspaceRootPath,
    recentAttachments,
    setFileBrowserError,
    setFileBrowserItems,
    setFileBrowserLoading,
    setFileBrowserParentPath,
    setFileBrowserPath,
    setFileBrowserQuery,
    setFileBrowserSearchLoading,
    setFileBrowserSearchResults,
    setRecentAttachments,
    setSidebarFileRequest,
    sidebarFileRequest,
  };
}
