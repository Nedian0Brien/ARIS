'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import {
  Play, Terminal, FolderOpen, Search, PlusCircle, X, Plus,
  Clock3, ArrowUpRight, Folder, ArrowUp, Check,
  MoreVertical, Activity, Pin, Edit2, RotateCw, Square, Trash2, HardDrive,
} from 'lucide-react';
import { Button, Input, Card, Badge } from '@/components/ui';
import { DeferredResponsiveContainer } from '@/components/charts/DeferredResponsiveContainer';
import type { GlobalChatStats, ProjectSummary } from '@/lib/happy/types';
import { extractLastDirectoryName } from '@/lib/happy/utils';
import { ClaudeIcon, GeminiIcon, CodexIcon } from '@/components/ui/AgentIcons';
import { readLocalStorage, writeLocalStorage } from '@/lib/browser/localStorage';
import { hasAppBasePath, withAppBasePath } from '@/lib/routing/appPath';
import { PieChart, Pie, Cell } from 'recharts';
import { reconcileDeletedProjects } from './projectDashboardState';
import styles from './ProjectDashboard.module.css';

type PathHistoryEntry = {
  path: string;
  lastUsedAt: string;
  projectId?: string;
};

type AgentOption = {
  id: 'claude' | 'codex' | 'gemini';
  label: string;
  Icon: React.ComponentType<{ size?: number }>;
  accentColor: string;
  accentBg: string;
};

interface DirectoryInfo {
  name: string;
  path: string;
}
const PATH_HISTORY_STORAGE_KEY = 'aris:new-project-path-history';
const MAX_PATH_HISTORY_ITEMS = 8;
const FALLBACK_DATE_ISO = '1970-01-01T00:00:00.000Z';
const SERVER_METRICS_POLL_INTERVAL_MS = 10_000;
const PERMISSION_POLL_INTERVAL_MS = 5_000;

type ProjectUiStatus = 'running' | 'pending' | 'completed' | 'idle';

type ServerMetric = {
  percent: number;
  usedBytes: number;
  totalBytes: number;
};

type ServerMetrics = {
  cpu: ServerMetric;
  ram: ServerMetric;
  storage: ServerMetric;
  capturedAt: string;
};

const PROJECT_UI_STATUS_META: Record<
  ProjectUiStatus,
  { label: string; color: string; variant: 'sky' | 'amber' | 'emerald' | 'slate' }
> = {
  running: { label: '실행 중', color: 'var(--chart-status-running)', variant: 'sky' },
  pending: { label: '대기', color: 'var(--chart-status-pending)', variant: 'amber' },
  completed: { label: '완료', color: 'var(--chart-status-completed)', variant: 'emerald' },
  idle: { label: '유휴', color: 'var(--chart-status-idle)', variant: 'slate' },
};

const AGENT_OPTIONS: AgentOption[] = [
  {
    id: 'claude',
    label: 'Claude',
    Icon: ClaudeIcon,
    accentColor: 'var(--agent-claude-accent)',
    accentBg: 'var(--agent-claude-bg)',
  },
  {
    id: 'codex',
    label: 'Codex',
    Icon: CodexIcon,
    accentColor: 'var(--agent-codex-accent)',
    accentBg: 'var(--agent-codex-bg)',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    Icon: GeminiIcon,
    accentColor: 'var(--agent-gemini-accent)',
    accentBg: 'var(--agent-gemini-bg)',
  },
];

function sanitizePath(path: string): string {
  return path.trim();
}

function normalizeDate(value: unknown): string {
  if (typeof value !== 'string') {
    return FALLBACK_DATE_ISO;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return FALLBACK_DATE_ISO;
  }

  return value;
}

function formatHistoryDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return '방금 전';
    if (diffMins < 60) return `${diffMins}분 전`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}시간 전`;
    
    return d.toLocaleDateString();
  } catch {
    return 'unknown';
  }
}

function parseIsoEpoch(value: string | null | undefined): number | null {
  if (!value) return null;
  const epoch = Date.parse(value);
  if (!Number.isFinite(epoch)) return null;
  return epoch;
}

function resolveProjectUiStatus(
  project: ProjectSummary,
  pendingPermissionProjectIds: Set<string>,
): ProjectUiStatus {
  if (pendingPermissionProjectIds.has(project.id)) {
    return 'pending';
  }

  if (project.status === 'running') {
    return 'running';
  }

  const lastActivityEpoch = parseIsoEpoch(project.lastActivityAt);
  const lastReadEpoch = parseIsoEpoch(project.lastReadAt ?? null);
  const isUnreadAfterCompletion = lastActivityEpoch !== null && (lastReadEpoch === null || lastReadEpoch < lastActivityEpoch);
  return isUnreadAfterCompletion ? 'completed' : 'idle';
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = 1024 ** 3;
  const mb = 1024 ** 2;
  if (bytes >= gb) return `${(bytes / gb).toFixed(1)} GB`;
  return `${Math.round(bytes / mb)} MB`;
}

function normalizeAbsoluteBrowserPath(input: string, rootPath: string): string {
  const normalized = input.replace(/\\/g, '/').trim().replace(/\/+$/, '');
  if (!normalized || normalized === '/') {
    return rootPath;
  }
  if (normalized.startsWith('/')) {
    return normalized;
  }
  return `${rootPath}/${normalized}`.replace(/\/+/g, '/');
}

function buildProjectDashboardPath(projectId: string): string {
  return `/?tab=project&project=${encodeURIComponent(projectId)}`;
}

export function ProjectDashboard({ 
  initialProjects, 
  isOperator,
  browserRootPath,
}: { 
  initialProjects: ProjectSummary[];
  isOperator: boolean;
  browserRootPath: string;
}) {
  const normalizedBrowserRootPath = useMemo(
    () => normalizeAbsoluteBrowserPath(browserRootPath, '/home/ubuntu'),
    [browserRootPath],
  );
  const router = useRouter();

  function navigateToAppPath(path: string) {
    const destination = withAppBasePath(path);
    if (hasAppBasePath()) {
      window.location.assign(destination);
      return;
    }
    router.push(destination);
  }

  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newBranch, setNewBranch] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Directory Browser States
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [browserPath, setBrowserPath] = useState(normalizedBrowserRootPath);
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [isLoadingDirs, setIsLoadingDirs] = useState(false);
  const [isBrowserPathEditing, setIsBrowserPathEditing] = useState(false);
  const [browserPathDraft, setBrowserPathDraft] = useState(normalizedBrowserRootPath);

  // Recent History State
  const [pathHistory, setPathHistory] = useState<PathHistoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent');

  // Local state for actions
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pinnedProjects, setPinnedProjects] = useState<Set<string>>(new Set());
  const [projectAliases, setProjectAliases] = useState<Record<string, string>>({});
  
  // Modals
  const [renameModalProject, setRenameModalProject] = useState<{id: string, currentName: string} | null>(null);
  const [newNameInput, setNewNameInput] = useState('');
  const [selectedProjectIds, setSelectedProjectIds] = useState<Set<string>>(new Set());
  const [pendingDeleteProjectIds, setPendingDeleteProjectIds] = useState<string[] | null>(null);
  const [isDeletingProjects, setIsDeletingProjects] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [pendingDeletedProjectIds, setPendingDeletedProjectIds] = useState<Set<string>>(new Set());

  // Local mutation state
  const [projectsList, setProjectsList] = useState<ProjectSummary[]>(initialProjects);
  const [pendingPermissionProjectIds, setPendingPermissionProjectIds] = useState<Set<string>>(new Set());
  const [chatStats, setChatStats] = useState<GlobalChatStats | null>(null);
  const [pendingChatIds, setPendingChatIds] = useState<Set<string>>(new Set());
  const [serverMetrics, setServerMetrics] = useState<ServerMetrics | null>(null);
  const [isLoadingServerMetrics, setIsLoadingServerMetrics] = useState(true);
  const [serverMetricsError, setServerMetricsError] = useState<string | null>(null);

  useEffect(() => {
    const reconciled = reconcileDeletedProjects(initialProjects, pendingDeletedProjectIds);
    setProjectsList(reconciled.projects);
    setPendingDeletedProjectIds(reconciled.pendingDeletedIds);

    // Initialize pinned and aliases from initialProjects (fetched from DB)
    const pins = new Set<string>();
    const aliases: Record<string, string> = {};
    reconciled.projects.forEach(s => {
      if (s.isPinned) pins.add(s.id);
      if (s.alias) aliases[s.id] = s.alias;
    });
    setPinnedProjects(pins);
    setProjectAliases(aliases);
  }, [initialProjects, pendingDeletedProjectIds]);

  // 워크스페이스 상태(실행 중 등)를 주기적으로 갱신 — 초기 로드 이후 백엔드 상태 변화를 반영
  useEffect(() => {
    const POLL_INTERVAL_MS = 4000;
    let disposed = false;
    let inFlight = false;

    const refresh = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const res = await fetch('/api/runtime/projects', { cache: 'no-store' });
        if (disposed || !res.ok) return;
        const data = (await res.json()) as { projects?: ProjectSummary[]; chatStats?: GlobalChatStats };
        if (disposed || !data.projects) return;
        const reconciled = reconcileDeletedProjects(data.projects, pendingDeletedProjectIds);
        setProjectsList(reconciled.projects);
        setPendingDeletedProjectIds(reconciled.pendingDeletedIds);
        if (data.chatStats) setChatStats(data.chatStats);
      } catch {
        // 네트워크 오류는 무시 — 다음 주기에 재시도
      } finally {
        inFlight = false;
      }
    };

    const timer = window.setInterval(() => { void refresh(); }, POLL_INTERVAL_MS);
    return () => {
      disposed = true;
      window.clearInterval(timer);
    };
  }, [pendingDeletedProjectIds]);

  useEffect(() => {
    setSelectedProjectIds((prev) => {
      if (prev.size === 0) return prev;
      const activeIds = new Set(projectsList.map((s) => s.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (activeIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
  }, [projectsList]);

  useEffect(() => {
    const es = new EventSource('/api/runtime/projects/stream');

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data as string) as { projects?: ProjectSummary[]; chatStats?: GlobalChatStats };
        if (!Array.isArray(data.projects)) return;

        const reconciled = reconcileDeletedProjects(data.projects, pendingDeletedProjectIds);
        setProjectsList(reconciled.projects);
        setPendingDeletedProjectIds(reconciled.pendingDeletedIds);
        if (data.chatStats) setChatStats(data.chatStats);

        const pins = new Set<string>();
        const aliases: Record<string, string> = {};
        reconciled.projects.forEach((project) => {
          if (project.isPinned) pins.add(project.id);
          if (typeof project.alias === 'string' && project.alias.trim()) {
            aliases[project.id] = project.alias;
          }
        });
        setPinnedProjects(pins);
        setProjectAliases(aliases);
      } catch {
        // JSON parse 실패 무시
      }
    };

    es.onerror = () => {
      // EventSource가 자동으로 재연결을 시도함
    };

    return () => {
      es.close();
    };
  }, [pendingDeletedProjectIds]);

  useEffect(() => {
    let isCancelled = false;
    let inFlight = false;

    const fetchPendingPermissions = async () => {
      if (isCancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        const response = await fetch('/api/runtime/permissions', { cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as {
          permissions?: Array<{ projectId?: string; chatId?: string | null }>;
        };
        if (!response.ok || !Array.isArray(body.permissions)) {
          throw new Error('Failed to refresh pending permissions');
        }

        if (!isCancelled) {
          const nextProjectIds = new Set<string>();
          const nextChatIds = new Set<string>();
          body.permissions?.forEach((permission) => {
            if (typeof permission?.projectId === 'string' && permission.projectId.trim()) {
              nextProjectIds.add(permission.projectId);
            }
            if (typeof permission?.chatId === 'string' && permission.chatId.trim()) {
              nextChatIds.add(permission.chatId);
            }
          });
          setPendingPermissionProjectIds(nextProjectIds);
          setPendingChatIds(nextChatIds);
        }
      } catch {
        // Keep last known pending set when sync fails.
      } finally {
        inFlight = false;
      }
    };

    void fetchPendingPermissions();
    const timerId = window.setInterval(() => {
      void fetchPendingPermissions();
    }, PERMISSION_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    setMounted(true);
    // Load histories
    const savedHist = readLocalStorage(PATH_HISTORY_STORAGE_KEY);
    if (savedHist) {
      try {
        const parsed = JSON.parse(savedHist);
        if (Array.isArray(parsed)) {
          setPathHistory(parsed.map(item => ({
            path: String(item.path || ''),
            lastUsedAt: normalizeDate(item.lastUsedAt),
            projectId: item.projectId ? String(item.projectId) : undefined,
            // agent, approvalPolicy fields ignored (backwards compat)
          })));
        }
      } catch (e) {
        console.error('Failed to parse path history', e);
      }
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-project-menu-anchor]')) {
        return;
      }
      setOpenMenuId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (mounted) {
      writeLocalStorage(PATH_HISTORY_STORAGE_KEY, JSON.stringify(pathHistory));
    }
  }, [pathHistory, mounted]);

  useEffect(() => {
    if (isBrowsing && directories.length === 0) {
      fetchDirectory(browserPath);
    }
  }, [isBrowsing, directories.length, browserPath]);

  useEffect(() => {
    let isCancelled = false;
    let inFlight = false;

    const fetchServerMetrics = async () => {
      if (inFlight) return;
      inFlight = true;

      try {
        const response = await fetch('/api/runtime/system', { cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          metrics?: {
            cpu?: { percent?: number };
            ram?: { percent?: number; usedBytes?: number; totalBytes?: number };
            storage?: { percent?: number; usedBytes?: number; totalBytes?: number };
          };
          capturedAt?: string;
        };

        if (!response.ok || !body.metrics) {
          throw new Error(body.error ?? '서버 리소스 정보를 불러오지 못했습니다.');
        }

        if (!isCancelled) {
          setServerMetrics({
            cpu: {
              percent: clampPercent(Number(body.metrics.cpu?.percent ?? 0)),
              usedBytes: 0,
              totalBytes: 0,
            },
            ram: {
              percent: clampPercent(Number(body.metrics.ram?.percent ?? 0)),
              usedBytes: Math.max(0, Number(body.metrics.ram?.usedBytes ?? 0)),
              totalBytes: Math.max(0, Number(body.metrics.ram?.totalBytes ?? 0)),
            },
            storage: {
              percent: clampPercent(Number(body.metrics.storage?.percent ?? 0)),
              usedBytes: Math.max(0, Number(body.metrics.storage?.usedBytes ?? 0)),
              totalBytes: Math.max(0, Number(body.metrics.storage?.totalBytes ?? 0)),
            },
            capturedAt: typeof body.capturedAt === 'string' ? body.capturedAt : new Date().toISOString(),
          });
          setServerMetricsError(null);
        }
      } catch (error) {
        if (!isCancelled) {
          const message = error instanceof Error ? error.message : '서버 리소스 정보를 불러오지 못했습니다.';
          setServerMetricsError(message);
        }
      } finally {
        if (!isCancelled) {
          setIsLoadingServerMetrics(false);
        }
        inFlight = false;
      }
    };

    void fetchServerMetrics();
    const timerId = window.setInterval(() => {
      void fetchServerMetrics();
    }, SERVER_METRICS_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(timerId);
    };
  }, []);

  async function fetchDirectory(targetPath: string) {
    setIsLoadingDirs(true);
    try {
      const response = await fetch(`/api/fs/list?path=${encodeURIComponent(targetPath)}`);
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || 'Failed to list directory');
      setDirectories(body.directories || []);
      setParentPath(body.parentPath);
      setBrowserPath(targetPath);
    } catch (err) {
      console.error('Directory fetch error:', err);
    } finally {
      setIsLoadingDirs(false);
    }
  }

  function recordHistory(pathInput: string, projectId?: string) {
    const path = sanitizePath(pathInput);
    if (!path) return;
    setPathHistory((prev) => {
      const next = [
        { path, lastUsedAt: new Date().toISOString(), projectId },
        ...prev.filter((item) => item.path !== path),
      ];
      return next.slice(0, MAX_PATH_HISTORY_ITEMS);
    });
  }

  async function createProject(pathInput: string, branchInput: string) {
    if (!isOperator) return;
    const path = sanitizePath(pathInput);
    if (!path) { setError('프로젝트 경로를 입력해 주세요.'); return; }

    setError(null);
    setIsCreating(true);
    const branch = branchInput.trim() || undefined;
    try {
      const response = await fetch('/api/runtime/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, ...(branch ? { branch } : {}) }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? '워크스페이스 생성에 실패했습니다.');
      const projectId = body.project?.id;
      if (!projectId) throw new Error('워크스페이스 생성 응답이 올바르지 않습니다.');

      recordHistory(path, projectId);
      navigateToAppPath(buildProjectDashboardPath(projectId));
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCreateProject(e: React.FormEvent) {
    e.preventDefault();
    await createProject(newPath, newBranch);
  }

  function openCreateProjectModal() {
    setError(null);
    setNewPath('');
    setNewBranch('');
    setIsBrowsing(true);
    setBrowserPath(normalizedBrowserRootPath);
    setDirectories([]);
    setParentPath(null);
    setIsBrowserPathEditing(false);
    setBrowserPathDraft(normalizedBrowserRootPath);
    setIsCreateModalOpen(true);
  }

  function openBrowserPathEditor() {
    setBrowserPathDraft(browserPath);
    setIsBrowserPathEditing(true);
  }

  function applyBrowserPath() {
    const nextBrowserPath = normalizeAbsoluteBrowserPath(browserPathDraft, normalizedBrowserRootPath);
    setIsBrowserPathEditing(false);
    setBrowserPath(nextBrowserPath);
    void fetchDirectory(nextBrowserPath);
  }

  async function handleQuickResume(entry: PathHistoryEntry) {
    if (!isOperator || isCreating) return;
    if (entry.projectId && projectsList.some((s) => s.id === entry.projectId)) {
      recordHistory(entry.path, entry.projectId);
      navigateToAppPath(buildProjectDashboardPath(entry.projectId));
      return;
    }
    await createProject(entry.path, '');
  }

  function applyHistory(entry: PathHistoryEntry) {
    setNewPath(entry.path);
    setError(null);
  }

  // --- Project Actions ---
  const togglePin = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isPinnedNow = pinnedProjects.has(id);
    const nextValue = !isPinnedNow;

    // Optimistic Update
    setPinnedProjects(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setOpenMenuId(null);

    try {
      const res = await fetch(`/api/runtime/projects/${id}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: nextValue }),
      });
      if (!res.ok) throw new Error('Failed to save pin status');
    } catch (err) {
      console.error(err);
      // Revert on error
      setPinnedProjects(prev => {
        const next = new Set(prev);
        if (isPinnedNow) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  };

  const openRenameModal = (project: ProjectSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentName = projectAliases[project.id] || project.projectName;
    setRenameModalProject({ id: project.id, currentName });
    setNewNameInput(currentName);
    setOpenMenuId(null);
  };

  const saveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (renameModalProject && newNameInput.trim()) {
      const projectId = renameModalProject.id;
      const nextAlias = newNameInput.trim();
      const prevAlias = projectAliases[projectId];

      // Optimistic Update
      setProjectAliases(prev => ({...prev, [projectId]: nextAlias}));
      setRenameModalProject(null);

      try {
        const res = await fetch(`/api/runtime/projects/${projectId}/metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alias: nextAlias }),
        });
        if (!res.ok) throw new Error('Failed to save alias');
      } catch (err) {
        console.error(err);
        // Revert on error
        setProjectAliases(prev => ({...prev, [projectId]: prevAlias}));
      }
    } else {
      setRenameModalProject(null);
    }
  };

  const executeProjectAction = async (id: string, action: 'retry' | 'abort' | 'kill', e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    if (action === 'kill') {
      requestDeleteProjects([id]);
      return;
    }

    try {
      const res = await fetch(`/api/runtime/projects/${id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`Action ${action} failed`);

      setProjectsList(prev => prev.map(s => {
        if (s.id === id) {
          return { ...s, status: action === 'abort' ? 'stopped' : 'running' };
        }
        return s;
      }));
    } catch (err) {
      console.error(err);
      alert(`${action} 요청 중 오류가 발생했습니다.`);
    }
  };

  const requestDeleteProjects = (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;
    setPendingDeleteProjectIds(uniqueIds);
    setOpenMenuId(null);
  };

  const toggleProjectSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllVisibleProjects = () => {
    if (filteredProjects.length === 0) return;
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      const allVisibleSelected = filteredProjects.every((project) => next.has(project.id));
      filteredProjects.forEach((project) => {
        if (allVisibleSelected) {
          next.delete(project.id);
        } else {
          next.add(project.id);
        }
      });
      return next;
    });
  };

  const clearSelectedProjects = () => {
    setSelectedProjectIds(new Set());
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedProjectIds(new Set());
      }
      return next;
    });
  };

  const confirmDeleteProjects = async () => {
    if (!pendingDeleteProjectIds || pendingDeleteProjectIds.length === 0) return;
    setIsDeletingProjects(true);

    const failedIds: string[] = [];
    for (const projectId of pendingDeleteProjectIds) {
      try {
        const res = await fetch(`/api/runtime/projects/${projectId}/actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'kill' }),
        });
        if (!res.ok) {
          throw new Error(`Failed to delete ${projectId}`);
        }
      } catch (error) {
        console.error(error);
        failedIds.push(projectId);
      }
    }

    const removedIds = new Set(pendingDeleteProjectIds.filter((id) => !failedIds.includes(id)));
    if (removedIds.size > 0) {
      setPendingDeletedProjectIds((prev) => new Set([...prev, ...removedIds]));
      setProjectsList((prev) => prev.filter((project) => !removedIds.has(project.id)));
    }
    setSelectedProjectIds((prev) => {
      const next = new Set(prev);
      removedIds.forEach((id) => next.delete(id));
      return next;
    });

    if (failedIds.length > 0) {
      alert(`${failedIds.length}개 워크스페이스 삭제에 실패했습니다. 다시 시도해 주세요.`);
    }

    setIsDeletingProjects(false);
    setPendingDeleteProjectIds(null);
  };

  const visibleProjectsList = useMemo(
    () => projectsList.filter((project) => !pendingDeletedProjectIds.has(project.id)),
    [projectsList, pendingDeletedProjectIds],
  );

  const projectUiStatusById = useMemo(() => {
    const next = new Map<string, ProjectUiStatus>();
    visibleProjectsList.forEach((project) => {
      next.set(project.id, resolveProjectUiStatus(project, pendingPermissionProjectIds));
    });
    return next;
  }, [visibleProjectsList, pendingPermissionProjectIds]);

  const filteredProjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return [...visibleProjectsList]
      .filter((project) => {
        const alias = projectAliases[project.id]?.trim() || '';
        const displayName = alias || extractLastDirectoryName(project.projectName);
        if (!normalizedQuery) return true;
        return (
          displayName.toLowerCase().includes(normalizedQuery) ||
          project.projectName.toLowerCase().includes(normalizedQuery) ||
          project.id.toLowerCase().includes(normalizedQuery) ||
          String(project.agent).toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => {
        const aPinned = pinnedProjects.has(a.id) ? 1 : 0;
        const bPinned = pinnedProjects.has(b.id) ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned; // Pinned first

        if (sortBy === 'name') {
          const aName = projectAliases[a.id]?.trim() || extractLastDirectoryName(a.projectName);
          const bName = projectAliases[b.id]?.trim() || extractLastDirectoryName(b.projectName);
          return aName.localeCompare(bName);
        }

        const aTime = Date.parse(a.lastActivityAt || FALLBACK_DATE_ISO);
        const bTime = Date.parse(b.lastActivityAt || FALLBACK_DATE_ISO);
        return bTime - aTime;
      });
  }, [visibleProjectsList, searchQuery, sortBy, pinnedProjects, projectAliases]);
  const selectedCount = selectedProjectIds.size;
  const allVisibleSelected = filteredProjects.length > 0 && filteredProjects.every((project) => selectedProjectIds.has(project.id));

  const canRenderModal = isCreateModalOpen && typeof document !== 'undefined';
  const createModal = canRenderModal
    ? createPortal(
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content new-project-modal animate-in" onClick={(e) => e.stopPropagation()}>
            {/* Same modal structure as before */}
            <header className="modal-header">
              <div className="header-title-group">
                <div className="header-icon-box">
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 className="modal-title">새 워크스페이스 만들기</h3>
                  <p className="modal-subtitle">프로젝트 경로를 선택하여 시작하세요.</p>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)} className="close-btn">
                <X size={22} />
              </Button>
            </header>

            <form onSubmit={handleCreateProject} className="modal-body no-scrollbar">
              <div className="form-section">
                <label className="section-label">프로젝트 경로</label>
                <div className="selected-path-row">
                  <span className="selected-path-label">선택됨:</span>
                  {sanitizePath(newPath) ? (
                    <span className="selected-path-pill">
                      <FolderOpen size={11} />
                      {sanitizePath(newPath)}
                    </span>
                  ) : (
                    <span className="selected-path-empty">경로를 선택하세요</span>
                  )}
                </div>
                <div className="directory-browser animate-in">
                  <div className="browser-header">
                    <div className="current-path-edit-wrap">
                      {isBrowserPathEditing ? (
                        <input
                          className="path-inline-input"
                          type="text"
                          value={browserPathDraft}
                          onChange={(e) => setBrowserPathDraft(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              applyBrowserPath();
                            } else if (e.key === 'Escape') {
                              setIsBrowserPathEditing(false);
                            }
                          }}
                          disabled={!isOperator || isCreating}
                          autoFocus
                        />
                      ) : (
                        <span className="current-path-display">
                          {browserPath}
                        </span>
                      )}
                      <Button
                        type="button"
                        variant="ghost"
                        className="path-edit-btn"
                        onClick={() => {
                          if (isBrowserPathEditing) {
                            applyBrowserPath();
                          } else {
                            openBrowserPathEditor();
                          }
                        }}
                        disabled={!isOperator || isCreating}
                        title={isBrowserPathEditing ? '현재 위치 적용' : '현재 위치 직접 수정'}
                      >
                        {isBrowserPathEditing ? <Check size={14} /> : <Edit2 size={14} />}
                      </Button>
                    </div>
                  </div>

                  <div className="browser-list no-scrollbar">
                    {isLoadingDirs ? (
                      <div className="browser-loading">탐색 중...</div>
                    ) : (
                      <>
                        {parentPath !== null && (
                          <button
                            type="button"
                            onClick={() => fetchDirectory(parentPath)}
                            className="browser-item up-dir"
                          >
                            <ArrowUp size={16} />
                            <span>..</span>
                          </button>
                        )}
                        {directories.length === 0 && parentPath === null && (
                          <div className="browser-empty">표시할 디렉토리가 없습니다.</div>
                        )}
                        {directories.map((dir) => (
                          <button
                            key={dir.path}
                            type="button"
                            onClick={() => fetchDirectory(dir.path)}
                            className="browser-item folder"
                          >
                            <Folder size={16} />
                            <span>{dir.name}</span>
                          </button>
                        ))}
                      </>
                    )}
                  </div>
                  <Button
                    type="button"
                    variant="primary"
                    className="select-current-btn"
                    onClick={() => {
                      setNewPath(browserPath);
                      setIsBrowserPathEditing(false);
                    }}
                  >
                    <Check size={14} /> 이 경로 선택
                  </Button>
                </div>
              </div>

              {pathHistory.length > 0 && (
                <div className="form-section">
                  <div className="section-header">
                    <label className="section-label">최근 경로</label>
                    <span className="count-badge">{pathHistory.length}</span>
                  </div>
                  <div className="history-stack">
                    {pathHistory.map((entry) => {
                      const isLive = Boolean(entry.projectId && visibleProjectsList.some(s => s.id === entry.projectId));

                      return (
                        <div key={`${entry.path}-${entry.projectId ?? 'new'}`} className="history-card">
                          <button
                            type="button"
                            className={`history-info-btn ${sanitizePath(newPath) === entry.path ? 'selected' : ''}`}
                            onClick={() => applyHistory(entry)}
                          >
                            <span className="path-text">{entry.path}</span>
                            <div className="meta-row">
                              <span className="meta-item">
                                <Clock3 size={12} /> {formatHistoryDate(entry.lastUsedAt)}
                              </span>
                            </div>
                          </button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void handleQuickResume(entry)}
                            className="resume-btn"
                          >
                            {isLive ? <ArrowUpRight size={14} /> : <Play size={14} fill="currentColor" />}
                            <span>{isLive ? '열기' : '재개'}</span>
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="form-section">
                <div className="section-header">
                  <label className="section-label" htmlFor="new-branch-input">
                    브랜치
                    <span style={{ fontWeight: 400, color: 'var(--text-subtle)', textTransform: 'none', letterSpacing: 0, fontSize: '0.75rem' }}> (선택)</span>
                  </label>
                </div>
                <input
                  id="new-branch-input"
                  type="text"
                  className="input"
                  placeholder="예: feat/my-feature (없으면 기본 경로 사용)"
                  value={newBranch}
                  onChange={(e) => setNewBranch(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              {error && (
                <div className="form-error" style={{ color: 'var(--accent-red)', fontSize: '0.8125rem', padding: '0.5rem 0.75rem', background: 'var(--accent-red-bg)', borderRadius: 'var(--radius-sm)', marginBottom: '1rem' }}>
                  {error}
                </div>
              )}

              <footer className="modal-footer">
                <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
                  취소
                </Button>
                <Button type="submit" isLoading={isCreating} disabled={!isOperator || !sanitizePath(newPath)} className="submit-btn">
                  <Play size={18} fill="currentColor" /> 워크스페이스 만들기
                </Button>
              </footer>
            </form>
          </div>
        </div>,
        document.body,
      )
    : null;

  const cpuUsagePercent = clampPercent(serverMetrics?.cpu.percent ?? 0);
  const ramUsagePercent = clampPercent(serverMetrics?.ram.percent ?? 0);
  const storageUsagePercent = clampPercent(serverMetrics?.storage?.percent ?? 0);

  const cpuPieData = [
    { name: '사용중', value: cpuUsagePercent, color: 'var(--chart-status-running)' },
    { name: '여유', value: Math.max(0, 100 - cpuUsagePercent), color: 'var(--chart-track)' },
  ];
  const ramPieData = [
    { name: '사용중', value: ramUsagePercent, color: 'var(--chart-status-completed)' },
    { name: '여유', value: Math.max(0, 100 - ramUsagePercent), color: 'var(--chart-track)' },
  ];
  const cpuValueText = isLoadingServerMetrics && !serverMetrics ? '--' : `${Math.round(cpuUsagePercent)}%`;
  const ramValueText = isLoadingServerMetrics && !serverMetrics ? '--' : `${Math.round(ramUsagePercent)}%`;
  const storageValueText = isLoadingServerMetrics && !serverMetrics ? '--' : `${Math.round(storageUsagePercent)}%`;
  const storageDetailText = serverMetrics?.storage
    ? `${formatBytes(serverMetrics.storage.usedBytes)} / ${formatBytes(serverMetrics.storage.totalBytes)}`
    : 'collecting';

  const chatAgentDistData = chatStats
    ? AGENT_OPTIONS.map(agent => ({
        name: agent.label,
        value: chatStats.agentDistribution[agent.id as 'claude' | 'codex' | 'gemini'] ?? 0,
        color: agent.accentColor,
      })).filter(e => e.value > 0)
    : [];
  const agentDistributionData = chatAgentDistData.length > 0
    ? chatAgentDistData
    : [{ name: '없음', value: 1, color: 'var(--chart-track)' }];

  const totalChatCount = chatStats
    ? Object.values(chatStats.agentDistribution).reduce((a, b) => a + b, 0)
    : 0;

  const chatRunning = chatStats?.running ?? 0;
  const chatPending = pendingChatIds.size;
  const chatCompleted = chatStats?.completed ?? 0;
  const chatTotal = chatRunning + chatPending + chatCompleted;

  return (
    <div style={{ position: 'relative' }}>
      <div className={styles.dashboardTitleRow}>
        <div className={styles.dashboardTitleGroup}>
          <h2 className="title-lg" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={28} color="var(--primary)" /> Workspace
          </h2>
          <p className="text-sm text-muted">워크스페이스와 리소스를 효율적으로 관리하세요.</p>
        </div>
        {isOperator && (
          <Button
            type="button"
            onClick={openCreateProjectModal}
            className={`btn-primary ${styles.dashboardCreateButton}`}
            style={{ borderRadius: '99px', padding: '0.75rem 1.5rem', boxShadow: 'var(--shadow-md)' }}
          >
            <Plus size={18} /> 새 워크스페이스
          </Button>
        )}
      </div>

      <div className="animate-in">
        {visibleProjectsList.length === 0 ? (
          <Card style={{ padding: '6rem 2rem', textAlign: 'center', backgroundColor: 'var(--surface-subtle)', border: '2px dashed var(--line-strong)', borderRadius: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
              <FolderOpen size={80} strokeWidth={1} />
            </div>
            <h3 className="title-md" style={{ marginBottom: '0.5rem' }}>활성화된 워크스페이스가 없습니다</h3>
            <p className="text-muted text-sm" style={{ margin: '0 auto', maxWidth: '320px' }}>
              새로운 프로젝트 경로를 지정해서 첫 워크스페이스를 만들어 보세요.
            </p>
            <Button
              type="button"
              onClick={openCreateProjectModal}
              disabled={!isOperator}
              className="empty-state-primary-action btn-primary"
              style={{ borderRadius: '99px', marginTop: '2rem' }}
            >
              <PlusCircle size={18} /> 첫 워크스페이스 만들기
            </Button>
          </Card>
        ) : (
          <div className={styles.projectDashboardLayout}>
            <aside className={styles.projectDashboardSidebar}>
              
              {/* Server Status Apple-Style Card */}
              <Card className={`${styles.projectSidebarCard} ${styles.projectSidebarCardResource}`}>
                <h3 className={styles.projectSidebarTitle}>
                  <Activity size={16} color="var(--primary)" /> 서버 리소스
                </h3>
                <div className={styles.serverResourceGridHorizontal}>
                  <div className={styles.serverDonutCard}>
                    <div className={styles.serverDonutChart}>
                      <DeferredResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={140}>
                        <PieChart>
                          <Pie
                            data={cpuPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius="62%"
                            outerRadius="86%"
                            startAngle={90}
                            endAngle={-270}
                            dataKey="value"
                            animationBegin={0}
                            animationDuration={800}
                            stroke="none"
                            paddingAngle={1}
                            cornerRadius={8}
                          >
                            {cpuPieData.map((entry, index) => (
                              <Cell key={`cpu-cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </DeferredResponsiveContainer>
                      <div className={styles.serverDonutCenter}>
                        <div className={styles.serverDonutValue}>{cpuValueText}</div>
                        <div className={styles.serverDonutLabel}>CPU</div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.serverDonutCard}>
                    <div className={styles.serverDonutChart}>
                      <DeferredResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={140}>
                        <PieChart>
                          <Pie
                            data={ramPieData}
                            cx="50%"
                            cy="50%"
                            innerRadius="62%"
                            outerRadius="86%"
                            startAngle={90}
                            endAngle={-270}
                            dataKey="value"
                            animationBegin={0}
                            animationDuration={800}
                            stroke="none"
                            paddingAngle={1}
                            cornerRadius={8}
                          >
                            {ramPieData.map((entry, index) => (
                              <Cell key={`ram-cell-${index}`} fill={entry.color} />
                            ))}
                          </Pie>
                        </PieChart>
                      </DeferredResponsiveContainer>
                      <div className={styles.serverDonutCenter}>
                        <div className={styles.serverDonutValue}>{ramValueText}</div>
                        <div className={styles.serverDonutLabel}>RAM</div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className={styles.serverStorageCardFull}>
                  <div className={styles.serverStorageHeader}>
                    <div className={styles.serverStorageLabelRow}>
                      <HardDrive size={14} color="var(--text-muted)" />
                      <span className={styles.serverStorageLabel}>Storage</span>
                    </div>
                    <strong className={styles.serverStorageValue}>{storageValueText}</strong>
                  </div>
                  <div className={styles.serverStorageBarTrack} role="img" aria-label={`디스크 사용률 ${storageValueText}`}>
                    <div className={styles.serverStorageBarFill} style={{ width: `${storageUsagePercent}%` }} />
                  </div>
                  <div className={styles.serverStorageHint}>{storageDetailText}</div>
                </div>
                {serverMetricsError && (
                  <div className={styles.serverMetricError}>실시간 지표 갱신 실패: {serverMetricsError}</div>
                )}
	              </Card>

                {/* Project & Agent Stats Row */}
                <div className={styles.projectStatsGrid}>
                  {/* Project Status */}
                  <Card className={styles.projectSidebarCard}>
                    <h3 className={styles.projectSidebarTitle}>
                      <Terminal size={16} color="var(--accent-violet)" /> 워크스페이스 현황
                    </h3>
                    {/* 바 차트 — idle 세그먼트 없음 */}
                    <div className={styles.projectSummaryBarChart} role="img" aria-label="채팅 상태 요약">
                      {chatTotal > 0 ? (
                        <>
                          <div style={{ width: `${(chatRunning / chatTotal) * 100}%`, backgroundColor: PROJECT_UI_STATUS_META.running.color }} className={styles.projectBarSegment} />
                          <div style={{ width: `${(chatPending / chatTotal) * 100}%`, backgroundColor: PROJECT_UI_STATUS_META.pending.color }} className={styles.projectBarSegment} />
                          <div style={{ width: `${(chatCompleted / chatTotal) * 100}%`, backgroundColor: PROJECT_UI_STATUS_META.completed.color }} className={styles.projectBarSegment} />
                        </>
                      ) : null}
                    </div>

                    {/* 레전드 — idle 없음 */}
                    <div className={styles.projectSummaryLegend}>
                      {[
                        { status: 'running' as const, count: chatRunning },
                        { status: 'pending' as const, count: chatPending },
                        { status: 'completed' as const, count: chatCompleted },
                      ].map(({ status, count }) => (
                        <div key={status} className={styles.projectSummaryLegendItem}>
                          <span className={styles.projectSummaryLegendDot} style={{ backgroundColor: PROJECT_UI_STATUS_META[status].color }} />
                          <span>{PROJECT_UI_STATUS_META[status].label}</span>
                          <strong>{count}</strong>
                        </div>
                      ))}
                    </div>

                    {/* 채팅 리스트 섹션 */}
                    <div className={styles.projectStatusLists}>
                      <div className={styles.projectStatusSubSection}>
                        <h4 className={styles.projectStatusSubTitle}>진행 중인 채팅</h4>
                        {chatStats && chatStats.runningSample.length > 0 ? (
                          <div className={styles.projectMiniList}>
                            {chatStats.runningSample.map(chat => (
                              <div key={chat.id} className={styles.projectMiniItem}>
                                <span className={styles.projectMiniStatusDot} style={{ backgroundColor: 'var(--chart-status-running)' }} />
                                <span className={styles.projectMiniTextGroup}>
                                  <span className={styles.projectMiniName}>{chat.title}</span>
                                  <span className={styles.projectMiniSubName}>{chat.projectName}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : <p className={styles.projectEmptyHint}>없음</p>}
                      </div>
                      <div className={styles.projectStatusSubSection}>
                        <h4 className={styles.projectStatusSubTitle}>최근 완료</h4>
                        {chatStats && chatStats.completedSample.length > 0 ? (
                          <div className={styles.projectMiniList}>
                            {chatStats.completedSample.map(chat => (
                              <div
                                key={chat.id}
                                className={`${styles.projectMiniItem} ${styles.projectMiniItemClickable}`}
                                onClick={() => navigateToAppPath(`/?tab=project&project=${encodeURIComponent(chat.projectId)}&view=chat&chat=${encodeURIComponent(chat.id)}`)}
                                title={`${chat.title} — ${chat.projectName}`}
                              >
                                <span className={styles.projectMiniStatusDot} style={{ backgroundColor: 'var(--chart-status-completed)' }} />
                                <span className={styles.projectMiniTextGroup}>
                                  <span className={styles.projectMiniName}>{chat.title}</span>
                                  <span className={styles.projectMiniSubName}>{chat.projectName}</span>
                                </span>
                              </div>
                            ))}
                          </div>
                        ) : <p className={styles.projectEmptyHint}>없음</p>}
                      </div>
                    </div>
                  </Card>

                  {/* Agent Distribution */}
                  <Card className={styles.projectSidebarCard}>
                    <h4 className={styles.projectSidebarTitle}>채팅 에이전트 분포</h4>
                    <div className={styles.agentStatsContent}>
                      <div className={styles.agentDonutWrap}>
                        <div className={styles.agentDonutChart}>
                          <DeferredResponsiveContainer width="100%" height="100%" minWidth={0} minHeight={120}>
                            <PieChart>
                              <Pie
                                data={agentDistributionData}
                                cx="50%"
                                cy="50%"
                                innerRadius="62%"
                                outerRadius="86%"
                                startAngle={90}
                                endAngle={-270}
                                dataKey="value"
                                animationBegin={0}
                                animationDuration={800}
                                stroke="none"
                                paddingAngle={1}
                                cornerRadius={8}
                              >
                                {agentDistributionData.map((entry, index) => (
                                  <Cell key={`agent-cell-${index}`} fill={entry.color} />
                                ))}
                              </Pie>
                            </PieChart>
                          </DeferredResponsiveContainer>
                          <div className={styles.agentDonutCenter}>
                            <div className={styles.agentDonutValue}>{totalChatCount}</div>
                            <div className={styles.agentDonutLabel}>chats</div>
                          </div>
                        </div>
                      </div>
                      <div className={styles.agentSummaryLegend}>
                        {AGENT_OPTIONS.map((agent) => (
                          <div key={`agent-legend-${agent.id}`} className={styles.agentSummaryLegendItem}>
                            <div className={styles.agentSummaryLegendInfo}>
                              <span className={styles.projectSummaryLegendDot} style={{ backgroundColor: agent.accentColor }} />
                              <span>{agent.label}</span>
                            </div>
                            <strong>{chatStats?.agentDistribution[agent.id as 'claude' | 'codex' | 'gemini'] ?? 0}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                  </Card>
                </div>

	            </aside>
	            <section className={styles.projectDashboardMain}>
              <div className={styles.projectMainToolbar}>
                <div className={styles.projectSearchWrap}>
                  <Search size={18} color="var(--text-muted)" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="프로젝트, 워크스페이스 이름 검색..."
                    className={styles.projectSearchInput}
                  />
                </div>
                <div className={styles.projectToolbarRight}>
                  <div className={styles.projectSortWrap}>
                    <span className={styles.projectSortLabel}>정렬</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'recent' | 'name')}
                      className={styles.projectSortSelect}
                    >
                      <option value="recent">최근 활동순</option>
                      <option value="name">이름순</option>
                    </select>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={toggleSelectionMode}
                    className={styles.projectSelectionModeBtn}
                    title={isSelectionMode ? '선택 모드 종료' : '선택 모드'}
                    aria-label={isSelectionMode ? '선택 모드 종료' : '선택 모드'}
                  >
                    {isSelectionMode ? <X size={18} /> : <Square size={18} />}
                  </Button>
                </div>
              </div>

              {isSelectionMode && (
                <div className={styles.projectSelectionToolbar}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={toggleSelectAllVisibleProjects}
                    disabled={filteredProjects.length === 0}
                    className={styles.projectIconActionBtn}
                    title={allVisibleSelected ? '전체 선택 해제' : '전체 선택'}
                    aria-label={allVisibleSelected ? '전체 선택 해제' : '전체 선택'}
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={clearSelectedProjects}
                    disabled={selectedCount === 0}
                    className={styles.projectIconActionBtn}
                    title="선택 해제"
                    aria-label="선택 해제"
                  >
                    <X size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => requestDeleteProjects(Array.from(selectedProjectIds))}
                    disabled={selectedCount === 0}
                    className={`${styles.projectIconActionBtn} ${styles.projectIconDeleteBtn}`}
                    title={`선택 삭제 (${selectedCount})`}
                    aria-label={`선택 삭제 (${selectedCount})`}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              )}

              {filteredProjects.length === 0 ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  검색 결과가 없습니다.
                </div>
              ) : (
                <div className={styles.projectGrid}>
                  {filteredProjects.map((project) => {
                    const projectUiStatus = projectUiStatusById.get(project.id) ?? 'idle';
                    const projectUiStatusMeta = PROJECT_UI_STATUS_META[projectUiStatus];
                    const isPinned = pinnedProjects.has(project.id);
                    const displayName = projectAliases[project.id]?.trim() || extractLastDirectoryName(project.projectName);
                    const isMenuOpen = openMenuId === project.id;
                    const isSelected = selectedProjectIds.has(project.id);

                    return (
                      <div 
                        key={project.id} 
                        className={`${styles.projectCard} ${isSelected ? styles.projectCardSelected : ''}`}
                        style={{ zIndex: isMenuOpen ? 100 : 1, cursor: 'pointer' }}
                        onClick={(e) => {
                          const target = e.target as HTMLElement;
                          if (
                            target.closest('button') ||
                            target.closest('a') ||
                            target.closest('[data-project-menu-anchor]')
                          ) {
                            return;
                          }
                          if (isSelectionMode) {
                            toggleProjectSelection(project.id, e as React.MouseEvent);
                            return;
                          }
                          navigateToAppPath(buildProjectDashboardPath(project.id));
                        }}
                      >
                        {isSelectionMode && (
                          <button
                            type="button"
                            className={`${styles.projectSelectToggle} ${isSelected ? styles.projectSelectToggleActive : ''}`}
                            onClick={(e) => toggleProjectSelection(project.id, e)}
                            aria-label={isSelected ? '워크스페이스 선택 해제' : '워크스페이스 선택'}
                          >
                            {isSelected ? <Check size={14} /> : null}
                          </button>
                        )}
                        {isPinned && (
                          <div className={styles.pinBadge}>
                            <Pin size={12} fill="currentColor" />
                          </div>
                        )}
                        <div className={styles.projectCardHeader}>
                          <div className={`${styles.projectCardHeaderMain} ${isSelectionMode ? styles.projectCardHeaderMainSelectable : ''}`}>
                            <div className={styles.projectCardTitle} title={project.projectName}>{displayName}</div>
                            <div className={styles.projectCardId}>{project.id.slice(0, 10)}...</div>
                          </div>
                          <div className={styles.projectCardMenuAnchor} data-project-menu-anchor>
                            <button 
                              type="button"
                              className={styles.projectMenuBtn} 
                              onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : project.id); }}
                            >
                              <MoreVertical size={20} />
                            </button>
                            {isMenuOpen && (
                              <div className={styles.dropdownMenu}>
                                <a
                                  href={withAppBasePath(buildProjectDashboardPath(project.id))}
                                  className={styles.dropdownItem} 
                                  onClick={() => setOpenMenuId(null)}
                                >
                                  <ArrowUpRight size={16} /> 워크스페이스 열기
                                </a>
                                <button type="button" className={styles.dropdownItem} onClick={(e) => openRenameModal(project, e)}>
                                  <Edit2 size={16} /> 이름 변경
                                </button>
                                <button type="button" className={styles.dropdownItem} onClick={(e) => togglePin(project.id, e)}>
                                  <Pin size={16} /> {isPinned ? '고정 해제' : '상단 고정'}
                                </button>
                                <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--line)' }} />
                                <button type="button" className={styles.dropdownItem} onClick={(e) => executeProjectAction(project.id, 'retry', e)}>
                                  <RotateCw size={16} /> 워크스페이스 재실행
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                                  onClick={(e) => executeProjectAction(project.id, 'abort', e)}
                                >
                                  <Square size={16} /> 워크스페이스 종료
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                                  onClick={(e) => executeProjectAction(project.id, 'kill', e)}
                                >
                                  <Trash2 size={16} /> 워크스페이스 삭제
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className={styles.projectCardBody}>
                          {project.totalChats && project.totalChats > 0 && project.chatAgentCounts ? (
                            <div className={styles.chatAgentDistribution}>
                              {/* 수평 바 차트 */}
                              <div className={styles.chatAgentBar}>
                                {AGENT_OPTIONS
                                  .filter(a => (project.chatAgentCounts?.[a.id] ?? 0) > 0)
                                  .map(a => (
                                    <div
                                      key={a.id}
                                      className={styles.chatAgentBarSegment}
                                      style={{
                                        width: `${((project.chatAgentCounts?.[a.id] ?? 0) / project.totalChats!) * 100}%`,
                                        backgroundColor: a.accentColor,
                                      }}
                                    />
                                  ))
                                }
                              </div>
                              {/* 겹침 아이콘 그룹 */}
                              <div className={styles.agentAvatarStack}>
                                {AGENT_OPTIONS
                                  .filter(a => (project.chatAgentCounts?.[a.id] ?? 0) > 0)
                                  .sort((a, b) => (project.chatAgentCounts?.[b.id] ?? 0) - (project.chatAgentCounts?.[a.id] ?? 0))
                                  .map((a, idx) => {
                                    const AIcon = a.Icon;
                                    return (
                                      <div
                                        key={a.id}
                                        className={styles.agentAvatarItem}
                                        style={{
                                          backgroundColor: a.accentBg,
                                          color: a.accentColor,
                                          zIndex: AGENT_OPTIONS.length - idx,
                                          marginLeft: idx === 0 ? 0 : -8,
                                        }}
                                        title={a.label}
                                      >
                                        <AIcon size={14} />
                                      </div>
                                    );
                                  })
                                }
                              </div>
                            </div>
                          ) : (
                            <span className={styles.chatAgentEmpty}>채팅 없음</span>
                          )}
                          {/* 상태 배지 */}
                          <div>
                            <Badge variant={projectUiStatusMeta.variant}>
                              {projectUiStatusMeta.label}
                            </Badge>
                          </div>
                        </div>

                        <div className={styles.projectCardMeta}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock3 size={14} /> {formatHistoryDate(project.lastActivityAt || '')}
                          </span>
                          <a href={withAppBasePath(buildProjectDashboardPath(project.id))} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', minHeight: 'unset', fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>
                            열기
                          </a>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        )}
      </div>

      {createModal}

      {pendingDeleteProjectIds && (
        <div className="modal-overlay" onClick={() => { if (!isDeletingProjects) setPendingDeleteProjectIds(null); }}>
          <div className="modal-content new-project-modal rename-modal animate-in" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h3 className="modal-title" style={{ fontSize: '1rem' }}>워크스페이스 삭제 확인</h3>
            </header>
            <div className="modal-body" style={{ padding: '1.25rem 1.5rem' }}>
              <p style={{ marginBottom: '0.5rem', fontWeight: 700 }}>
                선택한 {pendingDeleteProjectIds.length}개 워크스페이스를 삭제하시겠습니까?
              </p>
              <p className="text-muted text-sm">삭제된 워크스페이스는 복구할 수 없습니다.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
                <Button type="button" variant="ghost" onClick={() => setPendingDeleteProjectIds(null)} disabled={isDeletingProjects}>
                  취소
                </Button>
                <Button
                  type="button"
                  isLoading={isDeletingProjects}
                  onClick={() => void confirmDeleteProjects()}
                  style={{ background: 'var(--accent-red)', color: 'var(--text-on-accent)' }}
                >
                  삭제
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModalProject && (
        <div className="modal-overlay" onClick={() => setRenameModalProject(null)}>
          <div className="modal-content new-project-modal rename-modal animate-in" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h3 className="modal-title" style={{ fontSize: '1rem' }}>워크스페이스 이름 변경</h3>
            </header>
            <form onSubmit={saveRename} className="modal-body" style={{ padding: '1.25rem 1.5rem' }}>
              <Input 
                autoFocus
                value={newNameInput} 
                onChange={e => setNewNameInput(e.target.value)} 
                placeholder="새로운 이름 입력..."
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
                <Button type="button" variant="ghost" onClick={() => setRenameModalProject(null)}>취소</Button>
                <Button type="submit" className="btn-primary">저장</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
