'use client';

import { useCallback, useEffect, useState } from 'react';

export type WorkspaceFileItem = {
  name: string;
  path: string;
  isDirectory: boolean;
  isFile: boolean;
};

export type WorkspaceFilesApi = {
  currentPath: string;
  parentPath: string | null;
  items: WorkspaceFileItem[];
  loading: boolean;
  error: string | null;
  cdInto: (item: WorkspaceFileItem) => void;
  cd: (path: string) => void;
  goUp: () => void;
  refresh: () => void;
};

type WorkspaceFilesOptions = {
  projectId?: string | null;
  workspacePanelId?: string | null;
};

type ListResponse = {
  currentPath?: string;
  parentPath?: string | null;
  directories?: unknown;
  error?: string;
};

function normalizeItem(raw: unknown): WorkspaceFileItem | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as Record<string, unknown>;
  const name = typeof candidate.name === 'string' ? candidate.name : null;
  const itemPath = typeof candidate.path === 'string' ? candidate.path : null;
  if (!name || !itemPath) return null;
  return {
    name,
    path: itemPath,
    isDirectory: candidate.isDirectory === true,
    isFile: candidate.isFile === true,
  };
}

function appendWorkspacePanelParams(url: URLSearchParams, options: WorkspaceFilesOptions): void {
  const projectId = typeof options.projectId === 'string' ? options.projectId.trim() : '';
  if (!projectId) return;
  url.set('projectId', projectId);
  const workspacePanelId = typeof options.workspacePanelId === 'string' ? options.workspacePanelId.trim() : '';
  if (workspacePanelId) {
    url.set('workspacePanelId', workspacePanelId);
  }
}

export function useWorkspaceFiles(
  initialPath: string,
  options: WorkspaceFilesOptions = {},
): WorkspaceFilesApi {
  const [currentPath, setCurrentPath] = useState(initialPath);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<WorkspaceFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const params = new URLSearchParams();
        params.set('path', currentPath);
        appendWorkspacePanelParams(params, options);
        const response = await fetch(`/api/fs/list?${params.toString()}`, { cache: 'no-store', signal: controller.signal });
        const body = (await response.json().catch(() => ({}))) as ListResponse;
        if (cancelled) return;

        if (!response.ok) {
          throw new Error(typeof body.error === 'string' && body.error.length > 0
            ? body.error
            : '파일 목록을 불러올 수 없습니다.');
        }

        const rawItems = Array.isArray(body.directories) ? body.directories : [];
        const normalized = rawItems
          .map((entry) => normalizeItem(entry))
          .filter((entry): entry is WorkspaceFileItem => entry !== null);
        setItems(normalized);
        setParentPath(typeof body.parentPath === 'string' ? body.parentPath : null);
      } catch (err) {
        if (cancelled || (err instanceof DOMException && err.name === 'AbortError')) return;
        setError(err instanceof Error ? err.message : '파일 목록을 불러올 수 없습니다.');
        setItems([]);
        setParentPath(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [currentPath, options.projectId, options.workspacePanelId, refreshKey]);

  const cdInto = useCallback((item: WorkspaceFileItem) => {
    if (item.isDirectory) {
      setCurrentPath(item.path);
    }
  }, []);

  const cd = useCallback((next: string) => {
    if (typeof next === 'string' && next.length > 0) {
      setCurrentPath(next);
    }
  }, []);

  const goUp = useCallback(() => {
    if (parentPath) {
      setCurrentPath(parentPath);
    }
  }, [parentPath]);

  const refresh = useCallback(() => {
    setRefreshKey((value) => value + 1);
  }, []);

  return {
    currentPath,
    parentPath,
    items,
    loading,
    error,
    cdInto,
    cd,
    goUp,
    refresh,
  };
}
