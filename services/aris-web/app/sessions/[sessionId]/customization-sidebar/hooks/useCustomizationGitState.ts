import { useCallback, useEffect, useMemo, useState } from 'react';
import { buildGitFileTree, parseGitUnifiedDiff } from '@/lib/git/sidebarUi';
import { describeGitSidebarError } from '@/lib/git/sidebarErrors';
import type { GitActionName, GitDiffScope, GitFileEntry, GitOverview } from '../types';
import { expandGitTreeAncestors, gitTreeExpansionKey } from '../shared';

type UseCustomizationGitStateParams = {
  activeSurface: string;
  sessionId: string;
};

export function useCustomizationGitState({
  activeSurface,
  sessionId,
}: UseCustomizationGitStateParams) {
  const [gitOverview, setGitOverview] = useState<GitOverview | null>(null);
  const [gitLoading, setGitLoading] = useState(false);
  const [gitError, setGitError] = useState<string | null>(null);
  const [gitActionBusy, setGitActionBusy] = useState<GitActionName | null>(null);
  const [gitActionStatus, setGitActionStatus] = useState<string | null>(null);
  const [gitCommitMessage, setGitCommitMessage] = useState('');
  const [selectedGitPath, setSelectedGitPath] = useState<string | null>(null);
  const [gitListTab, setGitListTab] = useState<GitDiffScope>('working');
  const [selectedGitDiffScope, setSelectedGitDiffScope] = useState<GitDiffScope>('working');
  const [gitExpandedFolders, setGitExpandedFolders] = useState<Record<string, boolean>>({});
  const [gitDiffText, setGitDiffText] = useState('');
  const [gitDiffLoading, setGitDiffLoading] = useState(false);
  const [gitDiffError, setGitDiffError] = useState<string | null>(null);

  const selectedGitFile = useMemo<GitFileEntry | null>(
    () => gitOverview?.files.find((file) => file.path === selectedGitPath) ?? null,
    [gitOverview, selectedGitPath],
  );

  const applyGitOverview = useCallback((nextOverview: GitOverview) => {
    setGitOverview(nextOverview);
    setGitError(null);
    setSelectedGitPath((currentPath) => (
      currentPath && nextOverview.files.some((file) => file.path === currentPath)
        ? currentPath
        : nextOverview.files[0]?.path ?? null
    ));
  }, []);

  const loadGitOverview = useCallback(async () => {
    setGitLoading(true);
    setGitError(null);
    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/git`, {
        cache: 'no-store',
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Git 정보를 불러오지 못했습니다.');
      }

      applyGitOverview(data as GitOverview);
    } catch (error) {
      setGitError(error instanceof Error ? error.message : 'Git 정보를 불러오지 못했습니다.');
      setGitOverview(null);
      setSelectedGitPath(null);
    } finally {
      setGitLoading(false);
    }
  }, [applyGitOverview, sessionId]);

  const loadGitDiff = useCallback(async (filePath: string, scope: GitDiffScope) => {
    setGitDiffLoading(true);
    setGitDiffError(null);
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/git?kind=diff&path=${encodeURIComponent(filePath)}&scope=${encodeURIComponent(scope)}`,
        { cache: 'no-store' },
      );
      const data = await response.json().catch(() => null) as { diff?: string; error?: string } | null;
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'diff를 불러오지 못했습니다.');
      }

      setGitDiffText(data.diff ?? '');
    } catch (error) {
      setGitDiffError(error instanceof Error ? error.message : 'diff를 불러오지 못했습니다.');
      setGitDiffText('');
    } finally {
      setGitDiffLoading(false);
    }
  }, [sessionId]);

  const runGitAction = useCallback(async (
    action: GitActionName,
    payload?: { paths?: string[]; message?: string },
  ) => {
    setGitActionBusy(action);
    setGitActionStatus(null);
    setGitError(null);
    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/git`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          ...(payload?.paths ? { paths: payload.paths } : {}),
          ...(payload?.message ? { message: payload.message } : {}),
        }),
      });
      const data = await response.json().catch(() => null) as {
        overview?: GitOverview;
        output?: string;
        error?: string;
      } | null;
      if (!response.ok || !data) {
        throw new Error(typeof data?.error === 'string' ? data.error : 'Git 작업을 완료하지 못했습니다.');
      }

      if (data.overview) {
        applyGitOverview(data.overview);
      }
      setGitActionStatus(data.output ?? 'Git 작업을 완료했습니다.');
      if (action === 'commit') {
        setGitCommitMessage('');
      }
    } catch (error) {
      setGitActionStatus(error instanceof Error ? error.message : 'Git 작업을 완료하지 못했습니다.');
    } finally {
      setGitActionBusy(null);
    }
  }, [applyGitOverview, sessionId]);

  useEffect(() => {
    if (activeSurface !== 'git') {
      return;
    }
    if (gitOverview || gitLoading || gitError) {
      return;
    }
    void loadGitOverview();
  }, [activeSurface, gitError, gitLoading, gitOverview, loadGitOverview]);

  useEffect(() => {
    if (!selectedGitFile) {
      setGitDiffText('');
      setGitDiffError(null);
      return;
    }

    if (selectedGitDiffScope === 'staged' && !selectedGitFile.staged) {
      setSelectedGitDiffScope(selectedGitFile.unstaged || selectedGitFile.untracked ? 'working' : 'staged');
      return;
    }

    if (selectedGitDiffScope === 'working' && !selectedGitFile.unstaged && !selectedGitFile.untracked && selectedGitFile.staged) {
      setSelectedGitDiffScope('staged');
    }
  }, [selectedGitDiffScope, selectedGitFile]);

  useEffect(() => {
    if (activeSurface !== 'git' || !selectedGitFile) {
      return;
    }

    if (selectedGitDiffScope === 'working' && selectedGitFile.untracked && !selectedGitFile.staged) {
      setGitDiffText('');
      setGitDiffError(null);
      return;
    }

    if (selectedGitDiffScope === 'staged' && !selectedGitFile.staged) {
      return;
    }

    if (selectedGitDiffScope === 'working' && !selectedGitFile.unstaged && !selectedGitFile.untracked) {
      return;
    }

    void loadGitDiff(selectedGitFile.path, selectedGitDiffScope);
  }, [activeSurface, loadGitDiff, selectedGitDiffScope, selectedGitFile]);

  const stagedGitFiles = useMemo(
    () => gitOverview?.files.filter((file) => file.staged) ?? [],
    [gitOverview],
  );
  const workingGitFiles = useMemo(
    () => gitOverview?.files.filter((file) => file.unstaged || file.untracked) ?? [],
    [gitOverview],
  );
  const gitErrorDetails = gitError ? describeGitSidebarError(gitError) : null;
  const workingGitTree = useMemo(() => buildGitFileTree(workingGitFiles), [workingGitFiles]);
  const stagedGitTree = useMemo(() => buildGitFileTree(stagedGitFiles), [stagedGitFiles]);
  const activeGitFiles = gitListTab === 'working' ? workingGitFiles : stagedGitFiles;
  const activeGitTree = gitListTab === 'working' ? workingGitTree : stagedGitTree;
  const parsedGitDiff = useMemo(
    () => parseGitUnifiedDiff(gitDiffText, selectedGitFile?.path ?? selectedGitPath ?? 'diff.txt'),
    [gitDiffText, selectedGitFile?.path, selectedGitPath],
  );

  const selectGitFile = useCallback((path: string, scope: GitDiffScope) => {
    setSelectedGitPath(path);
    setGitListTab(scope);
    setGitDiffError(null);
    setSelectedGitDiffScope(scope);
    setGitExpandedFolders((current) => expandGitTreeAncestors(current, scope, path));
  }, []);

  const handleGitListTabChange = useCallback((scope: GitDiffScope) => {
    setGitListTab(scope);
    const nextFiles = scope === 'working' ? workingGitFiles : stagedGitFiles;
    const nextSelected = selectedGitPath
      ? nextFiles.find((file) => file.path === selectedGitPath)
      : null;

    if (nextSelected) {
      setSelectedGitDiffScope(scope);
      return;
    }

    if (nextFiles[0]) {
      selectGitFile(nextFiles[0].path, scope);
      return;
    }

    setSelectedGitPath(null);
    setSelectedGitDiffScope(scope);
    setGitDiffText('');
    setGitDiffError(null);
  }, [selectedGitPath, selectGitFile, stagedGitFiles, workingGitFiles]);

  const toggleGitFolder = useCallback((scope: GitDiffScope, path: string) => {
    const key = gitTreeExpansionKey(scope, path);
    setGitExpandedFolders((current) => ({
      ...current,
      [key]: !(current[key] ?? true),
    }));
  }, []);

  useEffect(() => {
    const nextFiles = gitListTab === 'working' ? workingGitFiles : stagedGitFiles;
    if (nextFiles.length === 0) {
      if (selectedGitPath && !nextFiles.some((file) => file.path === selectedGitPath)) {
        setSelectedGitPath(null);
      }
      return;
    }

    if (!selectedGitPath || !nextFiles.some((file) => file.path === selectedGitPath)) {
      selectGitFile(nextFiles[0].path, gitListTab);
    }
  }, [gitListTab, selectGitFile, selectedGitPath, stagedGitFiles, workingGitFiles]);

  return {
    activeGitFiles,
    activeGitTree,
    applyGitOverview,
    gitActionBusy,
    gitActionStatus,
    gitCommitMessage,
    gitDiffError,
    gitDiffLoading,
    gitDiffText,
    gitError,
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
  };
}
