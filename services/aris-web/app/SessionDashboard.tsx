'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Play, Terminal, FolderOpen, Search, PlusCircle, X, Plus,
  Clock3, ArrowUpRight, Folder, ArrowUp, Check,
  MoreVertical, Activity, Pin, Edit2, RotateCw, Square, Trash2, HardDrive,
  ShieldCheck, ShieldAlert, ShieldOff, Zap, CheckCircle2
} from 'lucide-react';
import { Button, Input, Card, Badge } from '@/components/ui';
import type { ApprovalPolicy, SessionSummary } from '@/lib/happy/types';
import { ClaudeIcon, GeminiIcon, CodexIcon } from '@/components/ui/AgentIcons';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import styles from './SessionDashboard.module.css';

type AgentFlavor = 'claude' | 'codex' | 'gemini';

type PathHistoryEntry = {
  path: string;
  agent: AgentFlavor;
  approvalPolicy: ApprovalPolicy;
  lastUsedAt: string;
  sessionId?: string;
};

type SessionApprovalPolicy = ApprovalPolicy;

type AgentOption = {
  id: AgentFlavor;
  label: string;
  subtitle: string;
  Icon: React.ComponentType<{ size?: number }>;
  accentColor: string;
  accentBg: string;
};

interface DirectoryInfo {
  name: string;
  path: string;
}

const PATH_HISTORY_STORAGE_KEY = 'aris:new-session-path-history';
const MAX_PATH_HISTORY_ITEMS = 8;
const FALLBACK_DATE_ISO = '1970-01-01T00:00:00.000Z';
const SERVER_METRICS_POLL_INTERVAL_MS = 10_000;
const SESSION_STATUS_POLL_INTERVAL_MS = 4_000;

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

const AGENT_OPTIONS: AgentOption[] = [
  {
    id: 'claude',
    label: 'Claude',
    subtitle: 'Balanced coding flow',
    Icon: ClaudeIcon,
    accentColor: '#D97757',
    accentBg: 'rgba(217, 119, 87, 0.15)',
  },
  {
    id: 'codex',
    label: 'Codex',
    subtitle: 'Fast implementation',
    Icon: CodexIcon,
    accentColor: '#10a37f',
    accentBg: 'rgba(16, 163, 127, 0.15)',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    subtitle: 'Broad reasoning',
    Icon: GeminiIcon,
    accentColor: '#4285F4',
    accentBg: 'rgba(66, 133, 244, 0.15)',
  },
];

const APPROVAL_POLICY_OPTIONS: Array<{
  id: SessionApprovalPolicy;
  label: string;
  description: string;
  Icon: React.ComponentType<{ size?: number }>;
  color: string;
}> = [
  {
    id: 'on-request',
    label: '요청 시 승인',
    description: '권한이 필요할 때마다 확인',
    Icon: ShieldCheck,
    color: '#3b82f6',
  },
  {
    id: 'on-failure',
    label: '실패 시 승인',
    description: '실패한 작업만 승인 요청',
    Icon: ShieldAlert,
    color: '#f59e0b',
  },
  {
    id: 'never',
    label: '자동 허용',
    description: '승인 없이 허용된 작업만 수행',
    Icon: ShieldOff,
    color: '#10b981',
  },
  {
    id: 'yolo',
    label: 'YOLO',
    description: '모든 권한 요청 자동 허용',
    Icon: Zap,
    color: '#ef4444',
  },
];

function isAgentFlavor(value: unknown): value is AgentFlavor {
  return value === 'claude' || value === 'codex' || value === 'gemini';
}

function resolveAgent(value: unknown): AgentFlavor {
  return isAgentFlavor(value) ? value : 'claude';
}

function isSessionApprovalPolicy(value: unknown): value is SessionApprovalPolicy {
  return value === 'on-request' || value === 'on-failure' || value === 'never' || value === 'yolo';
}

function resolveSessionApprovalPolicy(value: unknown): SessionApprovalPolicy {
  return isSessionApprovalPolicy(value) ? value : 'on-request';
}

function getAgentOption(value: unknown): AgentOption {
  const agent = resolveAgent(value);
  return AGENT_OPTIONS.find((item) => item.id === agent) ?? AGENT_OPTIONS[0];
}

function sanitizePath(path: string): string {
  return path.trim();
}

function extractLastDirectoryName(path: string): string {
  const normalized = path.replace(/\\/g, '/').trim().replace(/\/+$/, '');
  if (!normalized) return 'workspace';
  if (normalized === '/') return '/';
  const segments = normalized.split('/').filter(Boolean);
  return segments[segments.length - 1] ?? normalized;
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

const WORKSPACE_PATH_ROOT = '/workspace';

function trimWorkspacePath(path: string): string {
  const normalized = path.replace(/\\/g, '/').trim().replace(/\/+$/, '');
  if (!normalized || normalized === WORKSPACE_PATH_ROOT) return '/';

  if (normalized.startsWith(`${WORKSPACE_PATH_ROOT}/`)) {
    return normalized.slice(WORKSPACE_PATH_ROOT.length) || '/';
  }

  if (normalized.startsWith('/')) {
    return normalized || '/';
  }

  return `/${normalized}`;
}

function buildWorkspacePath(relativePath: string): string {
  const trimmed = trimWorkspacePath(relativePath);
  return trimmed === '/' ? WORKSPACE_PATH_ROOT : `${WORKSPACE_PATH_ROOT}${trimmed}`;
}

export function SessionDashboard({ 
  initialSessions, 
  isOperator 
}: { 
  initialSessions: SessionSummary[];
  isOperator: boolean;
}) {
  const router = useRouter();
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newAgent, setNewAgent] = useState<AgentFlavor>('claude');
  const [newApprovalPolicy, setNewApprovalPolicy] = useState<SessionApprovalPolicy>('on-request');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Directory Browser States
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [browserPath, setBrowserPath] = useState('/');
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [isLoadingDirs, setIsLoadingDirs] = useState(false);
  const [isBrowserPathEditing, setIsBrowserPathEditing] = useState(false);
  const [browserPathDraft, setBrowserPathDraft] = useState(WORKSPACE_PATH_ROOT);

  // Recent History State
  const [pathHistory, setPathHistory] = useState<PathHistoryEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'recent' | 'name'>('recent');

  // Local state for actions
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pinnedSessions, setPinnedSessions] = useState<Set<string>>(new Set());
  const [sessionAliases, setSessionAliases] = useState<Record<string, string>>({});
  
  // Modals
  const [renameModalSession, setRenameModalSession] = useState<{id: string, currentName: string} | null>(null);
  const [newNameInput, setNewNameInput] = useState('');
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [pendingDeleteSessionIds, setPendingDeleteSessionIds] = useState<string[] | null>(null);
  const [isDeletingSessions, setIsDeletingSessions] = useState(false);
  const [isSelectionMode, setIsSelectionMode] = useState(false);

  // Local mutation state
  const [sessionsList, setSessionsList] = useState<SessionSummary[]>(initialSessions);
  const [serverMetrics, setServerMetrics] = useState<ServerMetrics | null>(null);
  const [isLoadingServerMetrics, setIsLoadingServerMetrics] = useState(true);
  const [serverMetricsError, setServerMetricsError] = useState<string | null>(null);

  useEffect(() => {
    setSessionsList(initialSessions);
    
    // Initialize pinned and aliases from initialSessions (fetched from DB)
    const pins = new Set<string>();
    const aliases: Record<string, string> = {};
    initialSessions.forEach(s => {
      if (s.isPinned) pins.add(s.id);
      if (s.alias) aliases[s.id] = s.alias;
    });
    setPinnedSessions(pins);
    setSessionAliases(aliases);
  }, [initialSessions]);

  useEffect(() => {
    setSelectedSessionIds((prev) => {
      if (prev.size === 0) return prev;
      const activeIds = new Set(sessionsList.map((s) => s.id));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (activeIds.has(id)) {
          next.add(id);
        }
      });
      return next;
    });
  }, [sessionsList]);

  useEffect(() => {
    let isCancelled = false;
    let inFlight = false;

    const fetchSessionsSnapshot = async () => {
      if (isCancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        const response = await fetch('/api/runtime/sessions', { cache: 'no-store' });
        const body = (await response.json().catch(() => ({}))) as {
          sessions?: SessionSummary[];
          error?: string;
        };
        if (!response.ok || !Array.isArray(body.sessions)) {
          throw new Error(body.error ?? 'Failed to refresh sessions');
        }

        if (!isCancelled) {
          setSessionsList(body.sessions);

          const pins = new Set<string>();
          const aliases: Record<string, string> = {};
          body.sessions.forEach((session) => {
            if (session.isPinned) {
              pins.add(session.id);
            }
            if (typeof session.alias === 'string' && session.alias.trim()) {
              aliases[session.id] = session.alias;
            }
          });
          setPinnedSessions(pins);
          setSessionAliases(aliases);
        }
      } catch {
        // Keep current snapshot when sync fails; a later poll will recover.
      } finally {
        inFlight = false;
      }
    };

    void fetchSessionsSnapshot();
    const timerId = window.setInterval(() => {
      void fetchSessionsSnapshot();
    }, SESSION_STATUS_POLL_INTERVAL_MS);

    return () => {
      isCancelled = true;
      window.clearInterval(timerId);
    };
  }, []);

  useEffect(() => {
    setMounted(true);
    // Load histories
    const savedHist = localStorage.getItem(PATH_HISTORY_STORAGE_KEY);
    if (savedHist) {
      try {
        const parsed = JSON.parse(savedHist);
        if (Array.isArray(parsed)) {
          setPathHistory(parsed.map(item => ({
            path: String(item.path || ''),
            agent: resolveAgent(item.agent),
            approvalPolicy: resolveSessionApprovalPolicy(item.approvalPolicy),
            lastUsedAt: normalizeDate(item.lastUsedAt),
            sessionId: item.sessionId ? String(item.sessionId) : undefined,
          })));
        }
      } catch (e) {
        console.error('Failed to parse path history', e);
      }
    }

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (target instanceof Element && target.closest('[data-session-menu-anchor]')) {
        return;
      }
      setOpenMenuId(null);
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, []);

  useEffect(() => {
    if (mounted) {
      localStorage.setItem(PATH_HISTORY_STORAGE_KEY, JSON.stringify(pathHistory));
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

  function recordHistory(
    pathInput: string,
    agent: AgentFlavor,
    approvalPolicy: SessionApprovalPolicy,
    sessionId?: string,
  ) {
    const path = sanitizePath(pathInput);
    if (!path) return;
    setPathHistory((prev) => {
      const next = [
        { path, agent, approvalPolicy, lastUsedAt: new Date().toISOString(), sessionId },
        ...prev.filter((item) => item.path !== path),
      ];
      return next.slice(0, MAX_PATH_HISTORY_ITEMS);
    });
  }

  async function createSession(
    pathInput: string,
    agentInput: AgentFlavor,
    approvalPolicyInput: SessionApprovalPolicy,
  ) {
    if (!isOperator) return;
    const path = sanitizePath(pathInput);
    if (!path) { setError('프로젝트 경로를 입력해 주세요.'); return; }

    setError(null);
    setIsCreating(true);
    try {
      const response = await fetch('/api/runtime/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, agent: agentInput, approvalPolicy: approvalPolicyInput }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? '세션 생성에 실패했습니다.');
      const sessionId = body.session?.id;
      if (!sessionId) throw new Error('세션 생성 응답이 올바르지 않습니다.');

      recordHistory(path, agentInput, approvalPolicyInput, sessionId);
      router.push(`/sessions/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    await createSession(newPath, newAgent, newApprovalPolicy);
  }

  function openCreateSessionModal() {
    setError(null);
    setNewPath('');
    setIsBrowsing(true);
    setBrowserPath('/');
    setDirectories([]);
    setParentPath(null);
    setIsBrowserPathEditing(false);
    setBrowserPathDraft(WORKSPACE_PATH_ROOT);
    setNewApprovalPolicy('on-request');
    setIsCreateModalOpen(true);
  }

  function openBrowserPathEditor() {
    setBrowserPathDraft(buildWorkspacePath(browserPath));
    setIsBrowserPathEditing(true);
  }

  function applyBrowserPath() {
    const nextBrowserPath = trimWorkspacePath(browserPathDraft);
    setIsBrowserPathEditing(false);
    setBrowserPath(nextBrowserPath);
    void fetchDirectory(nextBrowserPath);
  }

  async function handleQuickResume(entry: PathHistoryEntry) {
    if (!isOperator || isCreating) return;
    if (entry.sessionId && sessionsList.some((s) => s.id === entry.sessionId)) {
      recordHistory(entry.path, entry.agent, entry.approvalPolicy, entry.sessionId);
      router.push(`/sessions/${entry.sessionId}`);
      return;
    }
    await createSession(entry.path, entry.agent, entry.approvalPolicy);
  }

  function applyHistory(entry: PathHistoryEntry) {
    setNewPath(entry.path);
    setNewAgent(entry.agent);
    setNewApprovalPolicy(entry.approvalPolicy);
    setError(null);
  }

  // --- Session Actions ---
  const togglePin = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const isPinnedNow = pinnedSessions.has(id);
    const nextValue = !isPinnedNow;

    // Optimistic Update
    setPinnedSessions(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setOpenMenuId(null);

    try {
      const res = await fetch(`/api/runtime/sessions/${id}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPinned: nextValue }),
      });
      if (!res.ok) throw new Error('Failed to save pin status');
    } catch (err) {
      console.error(err);
      // Revert on error
      setPinnedSessions(prev => {
        const next = new Set(prev);
        if (isPinnedNow) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  };

  const openRenameModal = (session: SessionSummary, e: React.MouseEvent) => {
    e.stopPropagation();
    const currentName = sessionAliases[session.id] || session.projectName;
    setRenameModalSession({ id: session.id, currentName });
    setNewNameInput(currentName);
    setOpenMenuId(null);
  };

  const saveRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (renameModalSession && newNameInput.trim()) {
      const sessionId = renameModalSession.id;
      const nextAlias = newNameInput.trim();
      const prevAlias = sessionAliases[sessionId];

      // Optimistic Update
      setSessionAliases(prev => ({...prev, [sessionId]: nextAlias}));
      setRenameModalSession(null);

      try {
        const res = await fetch(`/api/runtime/sessions/${sessionId}/metadata`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ alias: nextAlias }),
        });
        if (!res.ok) throw new Error('Failed to save alias');
      } catch (err) {
        console.error(err);
        // Revert on error
        setSessionAliases(prev => ({...prev, [sessionId]: prevAlias}));
      }
    } else {
      setRenameModalSession(null);
    }
  };

  const executeSessionAction = async (id: string, action: 'retry' | 'abort' | 'kill', e: React.MouseEvent) => {
    e.stopPropagation();
    setOpenMenuId(null);
    if (action === 'kill') {
      requestDeleteSessions([id]);
      return;
    }

    try {
      const res = await fetch(`/api/runtime/sessions/${id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`Action ${action} failed`);

      setSessionsList(prev => prev.map(s => {
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

  const requestDeleteSessions = (ids: string[]) => {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length === 0) return;
    setPendingDeleteSessionIds(uniqueIds);
    setOpenMenuId(null);
  };

  const toggleSessionSelection = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleSelectAllVisibleSessions = () => {
    if (filteredSessions.length === 0) return;
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      const allVisibleSelected = filteredSessions.every((session) => next.has(session.id));
      filteredSessions.forEach((session) => {
        if (allVisibleSelected) {
          next.delete(session.id);
        } else {
          next.add(session.id);
        }
      });
      return next;
    });
  };

  const clearSelectedSessions = () => {
    setSelectedSessionIds(new Set());
  };

  const toggleSelectionMode = () => {
    setIsSelectionMode((prev) => {
      const next = !prev;
      if (!next) {
        setSelectedSessionIds(new Set());
      }
      return next;
    });
  };

  const confirmDeleteSessions = async () => {
    if (!pendingDeleteSessionIds || pendingDeleteSessionIds.length === 0) return;
    setIsDeletingSessions(true);

    const failedIds: string[] = [];
    for (const sessionId of pendingDeleteSessionIds) {
      try {
        const res = await fetch(`/api/runtime/sessions/${sessionId}/actions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'kill' }),
        });
        if (!res.ok) {
          throw new Error(`Failed to delete ${sessionId}`);
        }
      } catch (error) {
        console.error(error);
        failedIds.push(sessionId);
      }
    }

    const removedIds = new Set(pendingDeleteSessionIds.filter((id) => !failedIds.includes(id)));
    if (removedIds.size > 0) {
      setSessionsList((prev) => prev.filter((session) => !removedIds.has(session.id)));
    }
    setSelectedSessionIds((prev) => {
      const next = new Set(prev);
      removedIds.forEach((id) => next.delete(id));
      return next;
    });

    if (failedIds.length > 0) {
      alert(`${failedIds.length}개 세션 삭제에 실패했습니다. 다시 시도해 주세요.`);
    }

    setIsDeletingSessions(false);
    setPendingDeleteSessionIds(null);
  };

  const sessionStats = useMemo(() => {
    const total = sessionsList.length;
    const idle = sessionsList.filter((s) => s.status === 'idle').length;
    const running = sessionsList.filter((s) => s.status === 'running').length;
    const pending = sessionsList.filter((s) => s.status === 'unknown').length;
    const completed = sessionsList.filter((s) => s.status === 'stopped' || s.status === 'error').length;
    return { total, idle, running, pending, completed };
  }, [sessionsList]);

  const agentStats = useMemo(() => {
    const stats = { claude: 0, codex: 0, gemini: 0 };
    sessionsList.forEach(s => {
      const a = resolveAgent(s.agent);
      if (a in stats) stats[a]++;
    });
    return stats;
  }, [sessionsList]);

  const filteredSessions = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return [...sessionsList]
      .filter((session) => {
        const alias = sessionAliases[session.id]?.trim() || '';
        const displayName = alias || extractLastDirectoryName(session.projectName);
        if (!normalizedQuery) return true;
        return (
          displayName.toLowerCase().includes(normalizedQuery) ||
          session.projectName.toLowerCase().includes(normalizedQuery) ||
          session.id.toLowerCase().includes(normalizedQuery) ||
          String(session.agent).toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => {
        const aPinned = pinnedSessions.has(a.id) ? 1 : 0;
        const bPinned = pinnedSessions.has(b.id) ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned; // Pinned first

        if (sortBy === 'name') {
          const aName = sessionAliases[a.id]?.trim() || extractLastDirectoryName(a.projectName);
          const bName = sessionAliases[b.id]?.trim() || extractLastDirectoryName(b.projectName);
          return aName.localeCompare(bName);
        }

        const aTime = Date.parse(a.lastActivityAt || FALLBACK_DATE_ISO);
        const bTime = Date.parse(b.lastActivityAt || FALLBACK_DATE_ISO);
        return bTime - aTime;
      });
  }, [sessionsList, searchQuery, sortBy, pinnedSessions, sessionAliases]);
  const selectedCount = selectedSessionIds.size;
  const allVisibleSelected = filteredSessions.length > 0 && filteredSessions.every((session) => selectedSessionIds.has(session.id));

  const canRenderModal = isCreateModalOpen && typeof document !== 'undefined';
  const createModal = canRenderModal
    ? createPortal(
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content new-session-modal animate-in" onClick={(e) => e.stopPropagation()}>
            {/* Same modal structure as before */}
            <header className="modal-header">
              <div className="header-title-group">
                <div className="header-icon-box">
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 className="modal-title">새 세션 시작하기</h3>
                  <p className="modal-subtitle">프로젝트 경로와 에이전트를 선택하여 시작하세요.</p>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)} className="close-btn">
                <X size={22} />
              </Button>
            </header>

            <form onSubmit={handleCreateSession} className="modal-body no-scrollbar">
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
                          <span className="path-prefix">{WORKSPACE_PATH_ROOT}</span>
                          {browserPath !== '/' ? browserPath : ''}
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
                    <Button 
                      type="button"
                      variant="primary" 
                      className="select-current-btn"
                      onClick={() => {
                        setNewPath(buildWorkspacePath(browserPath));
                        setIsBrowserPathEditing(false);
                      }}
                    >
                      <Check size={14} /> 이 경로 선택
                    </Button>
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
                      const agent = getAgentOption(entry.agent);
                      const AgentIcon = agent.Icon;
                      const isLive = Boolean(entry.sessionId && sessionsList.some(s => s.id === entry.sessionId));

                      return (
                        <div key={`${entry.path}-${entry.sessionId ?? 'new'}`} className="history-card">
                          <button
                            type="button"
                            className={`history-info-btn ${sanitizePath(newPath) === entry.path ? 'selected' : ''}`}
                            onClick={() => applyHistory(entry)}
                          >
                            <span className="path-text">{entry.path}</span>
                            <div className="meta-row">
                              <span className="meta-item" style={{ color: agent.accentColor }}>
                                <AgentIcon size={12} /> {agent.label}
                              </span>
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
                <label className="section-label">에이전트</label>
                <div className="agent-selection-grid">
                  {AGENT_OPTIONS.map((agent) => {
                    const AgentIcon = agent.Icon;
                    const isSelected = newAgent === agent.id;

                    return (
                      <button
                        key={agent.id}
                        type="button"
                        className={`agent-select-card ${isSelected ? 'active' : ''}`}
                        style={{ '--agent-color': agent.accentColor, '--agent-bg': agent.accentBg, '--agent-shadow': agent.accentColor + '26' } as React.CSSProperties}
                        onClick={() => {
                          setNewAgent(agent.id);
                          if (agent.id === 'gemini') {
                            setNewApprovalPolicy('on-request');
                          }
                        }}
                      >
                        <div className="agent-visual" style={{ backgroundColor: agent.accentBg, color: agent.accentColor }}>
                          <AgentIcon size={20} />
                        </div>
                        <div className="agent-details">
                          <div className="agent-label">{agent.label}</div>
                          <div className="agent-desc">{agent.subtitle}</div>
                        </div>
                        <CheckCircle2 size={16} className="agent-check" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="form-section">
                <div className="section-header">
                  <label className="section-label">승인 정책</label>
                  {newAgent === 'gemini' && <span className="text-muted text-sm">Gemini는 추후 지원</span>}
                </div>
                <div className="policy-grid">
                  {APPROVAL_POLICY_OPTIONS.map((policy) => {
                    const PolicyIcon = policy.Icon;
                    const selected = newApprovalPolicy === policy.id;
                    const disabled = newAgent === 'gemini';
                    return (
                      <button
                        key={policy.id}
                        type="button"
                        className={`policy-card ${selected ? 'active' : ''}`}
                        onClick={() => setNewApprovalPolicy(policy.id)}
                        disabled={disabled}
                        style={{ '--policy-color': policy.color } as React.CSSProperties}
                      >
                        <div className="policy-icon">
                          <PolicyIcon size={16} />
                        </div>
                        <span className="policy-label">{policy.label}</span>
                        <span className="policy-desc">{policy.description}</span>
                        <CheckCircle2 size={14} className="policy-check" />
                      </button>
                    );
                  })}
                </div>
                {newApprovalPolicy === 'yolo' && newAgent !== 'gemini' && (
                  <div className="form-error">
                    <Zap size={14} style={{ flexShrink: 0, marginTop: '0.1rem' }} />
                    모든 권한 요청을 자동 허용합니다. 신뢰 가능한 프로젝트에서만 사용하세요.
                  </div>
                )}
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
                  <Play size={18} fill="currentColor" /> 세션 시작하기
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
    { name: '사용중', value: cpuUsagePercent, color: '#3b82f6' },
    { name: '여유', value: Math.max(0, 100 - cpuUsagePercent), color: '#e2e8f0' },
  ];
  const ramPieData = [
    { name: '사용중', value: ramUsagePercent, color: '#10b981' },
    { name: '여유', value: Math.max(0, 100 - ramUsagePercent), color: '#e2e8f0' },
  ];
  const cpuValueText = isLoadingServerMetrics && !serverMetrics ? '--' : `${Math.round(cpuUsagePercent)}%`;
  const ramValueText = isLoadingServerMetrics && !serverMetrics ? '--' : `${Math.round(ramUsagePercent)}%`;
  const storageValueText = isLoadingServerMetrics && !serverMetrics ? '--' : `${Math.round(storageUsagePercent)}%`;
  const storageDetailText = serverMetrics?.storage
    ? `${formatBytes(serverMetrics.storage.usedBytes)} / ${formatBytes(serverMetrics.storage.totalBytes)}`
    : 'collecting';

  const activeAgentDistribution = AGENT_OPTIONS.map((agent) => ({
    name: agent.label,
    value: agentStats[agent.id],
    color: agent.accentColor,
  })).filter((entry) => entry.value > 0);
  const agentDistributionData = activeAgentDistribution.length > 0
    ? activeAgentDistribution
    : [{ name: '없음', value: 1, color: '#e2e8f0' }];

  // 진행 중인 세션 및 완료된 세션 필터링
  const runningSessions = useMemo(() => sessionsList.filter(s => s.status === 'running'), [sessionsList]);
  const completedSessions = useMemo(() => sessionsList.filter(s => s.status === 'stopped' || s.status === 'error'), [sessionsList]);

  return (
    <div style={{ position: 'relative' }}>
      <div className={styles.dashboardTitleRow}>
        <div className={styles.dashboardTitleGroup}>
          <h2 className="title-lg" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={28} color="var(--primary)" /> Workspace
          </h2>
          <p className="text-sm text-muted">에이전트 세션과 리소스를 효율적으로 관리하세요.</p>
        </div>
        {isOperator && (
          <Button
            type="button"
            onClick={openCreateSessionModal}
            className="btn-primary"
            style={{ borderRadius: '99px', padding: '0.75rem 1.5rem', boxShadow: 'var(--shadow-md)' }}
          >
            <Plus size={18} /> 새 세션
          </Button>
        )}
      </div>

      <div className="animate-in">
        {sessionsList.length === 0 ? (
          <Card style={{ padding: '6rem 2rem', textAlign: 'center', backgroundColor: 'var(--surface-subtle)', border: '2px dashed var(--line-strong)', borderRadius: '2rem' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', color: 'var(--text-muted)' }}>
              <FolderOpen size={80} strokeWidth={1} />
            </div>
            <h3 className="title-md" style={{ marginBottom: '0.5rem' }}>활성화된 세션이 없습니다</h3>
            <p className="text-muted text-sm" style={{ margin: '0 auto', maxWidth: '320px' }}>
              새로운 프로젝트 경로를 지정해서 첫 에이전트 세션을 시작해 보세요.
            </p>
            <Button
              type="button"
              onClick={openCreateSessionModal}
              disabled={!isOperator}
              className="empty-state-primary-action btn-primary"
              style={{ borderRadius: '99px', marginTop: '2rem' }}
            >
              <PlusCircle size={18} /> 첫 세션 시작하기
            </Button>
          </Card>
        ) : (
          <div className={styles.sessionDashboardLayout}>
            <aside className={styles.sessionDashboardSidebar}>
              
              {/* Server Status Apple-Style Card */}
              <Card className={`${styles.sessionSidebarCard} ${styles.sessionSidebarCardResource}`}>
                <h3 className={styles.sessionSidebarTitle}>
                  <Activity size={16} color="var(--primary)" /> 서버 리소스
                </h3>
                <div className={styles.serverResourceGridHorizontal}>
                  <div className={styles.serverDonutCard}>
                    <div className={styles.serverDonutChart}>
                      <ResponsiveContainer width="100%" height="100%">
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
                      </ResponsiveContainer>
                      <div className={styles.serverDonutCenter}>
                        <div className={styles.serverDonutValue}>{cpuValueText}</div>
                        <div className={styles.serverDonutLabel}>CPU</div>
                      </div>
                    </div>
                  </div>

                  <div className={styles.serverDonutCard}>
                    <div className={styles.serverDonutChart}>
                      <ResponsiveContainer width="100%" height="100%">
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
                      </ResponsiveContainer>
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

              {/* Session & Agent Stats Row */}
              <div className={styles.sessionStatsGrid}>
                {/* Session Status */}
                <Card className={styles.sessionSidebarCard}>
                  <h3 className={styles.sessionSidebarTitle}>
                    <Terminal size={16} color="var(--accent-violet)" /> 세션 현황
                  </h3>
                  <div className={styles.sessionSummaryBarChart} role="img" aria-label="세션 상태 요약">
                    {sessionStats.total > 0 ? (
                      <>
                        <div 
                          className={`${styles.sessionBarSegment} ${styles.sessionBarIdle}`} 
                          style={{ width: `${(sessionStats.idle / sessionStats.total) * 100}%` }}
                        />
                        <div 
                          className={`${styles.sessionBarSegment} ${styles.sessionBarRunning}`} 
                          style={{ width: `${(sessionStats.running / sessionStats.total) * 100}%`, backgroundColor: '#3b82f6' }}
                        />
                        <div 
                          className={`${styles.sessionBarSegment} ${styles.sessionBarPending}`} 
                          style={{ width: `${(sessionStats.pending / sessionStats.total) * 100}%` }}
                        />
                        <div 
                          className={`${styles.sessionBarSegment} ${styles.sessionBarCompleted}`} 
                          style={{ width: `${(sessionStats.completed / sessionStats.total) * 100}%`, backgroundColor: '#10b981' }}
                        />
                      </>
                    ) : (
                      <div className={styles.sessionBarSegment} style={{ width: '0%', backgroundColor: 'transparent' }} />
                    )}
                  </div>
                  <div className={styles.sessionSummaryLegend}>
                    <div className={styles.sessionSummaryLegendItem}>
                      <span className={styles.sessionSummaryLegendDot} style={{ backgroundColor: '#64748b' }}></span>
                      <span>유휴</span>
                      <strong>{sessionStats.idle}</strong>
                    </div>
                    <div className={styles.sessionSummaryLegendItem}>
                      <span className={styles.sessionSummaryLegendDot} style={{ backgroundColor: '#3b82f6' }}></span>
                      <span>실행중</span>
                      <strong>{sessionStats.running}</strong>
                    </div>
                    <div className={styles.sessionSummaryLegendItem}>
                      <span className={styles.sessionSummaryLegendDot} style={{ backgroundColor: '#f59e0b' }}></span>
                      <span>대기</span>
                      <strong>{sessionStats.pending}</strong>
                    </div>
                    <div className={styles.sessionSummaryLegendItem}>
                      <span className={styles.sessionSummaryLegendDot} style={{ backgroundColor: '#10b981' }}></span>
                      <span>완료</span>
                      <strong>{sessionStats.completed}</strong>
                    </div>
                  </div>

                  {/* 세션 리스트 섹션 */}
                  <div className={styles.sessionStatusLists}>
                    <div className={styles.sessionStatusSubSection}>
                      <h4 className={styles.sessionStatusSubTitle}>진행 중인 세션</h4>
                      {runningSessions.length > 0 ? (
                        <div className={styles.sessionMiniList}>
                          {runningSessions.slice(0, 3).map(s => (
                            <div key={s.id} className={styles.sessionMiniItem}>
                              <span className={styles.sessionMiniStatusDot} style={{ backgroundColor: '#3b82f6' }}></span>
                              <span className={styles.sessionMiniName}>{sessionAliases[s.id] || extractLastDirectoryName(s.projectName)}</span>
                            </div>
                          ))}
                        </div>
                      ) : <p className={styles.sessionEmptyHint}>없음</p>}
                    </div>
                    <div className={styles.sessionStatusSubSection}>
                      <h4 className={styles.sessionStatusSubTitle}>최근 완료</h4>
                      {completedSessions.length > 0 ? (
                        <div className={styles.sessionMiniList}>
                          {completedSessions.slice(0, 3).map(s => (
                            <div key={s.id} className={styles.sessionMiniItem}>
                              <span className={styles.sessionMiniStatusDot} style={{ backgroundColor: '#10b981' }}></span>
                              <span className={styles.sessionMiniName}>{sessionAliases[s.id] || extractLastDirectoryName(s.projectName)}</span>
                            </div>
                          ))}
                        </div>
                      ) : <p className={styles.sessionEmptyHint}>없음</p>}
                    </div>
                  </div>
                </Card>

                {/* Agent Distribution */}
                <Card className={styles.sessionSidebarCard}>
                  <h4 className={styles.sessionSidebarTitle}>에이전트 분포</h4>
                  <div className={styles.agentDonutWrap}>
                    <div className={styles.agentDonutChart}>
                      <ResponsiveContainer width="100%" height="100%">
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
                      </ResponsiveContainer>
                      <div className={styles.agentDonutCenter}>
                        <div className={styles.agentDonutValue}>{sessionStats.total}</div>
                        <div className={styles.agentDonutLabel}>sessions</div>
                      </div>
                    </div>
                  </div>
                  <div className={styles.sessionSummaryLegend}>
                    {AGENT_OPTIONS.map((agent) => (
                      <div key={`agent-legend-${agent.id}`} className={styles.sessionSummaryLegendItem}>
                        <span className={styles.sessionSummaryLegendDot} style={{ backgroundColor: agent.accentColor }}></span>
                        <span>{agent.label}</span>
                        <strong>{agentStats[agent.id]}</strong>
                      </div>
                    ))}
                  </div>
                </Card>
              </div>
            </aside>

            <section className={styles.sessionDashboardMain}>
              <div className={styles.sessionMainToolbar}>
                <div className={styles.sessionSearchWrap}>
                  <Search size={18} color="var(--text-muted)" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="프로젝트, 세션 이름 검색..."
                    className={styles.sessionSearchInput}
                  />
                </div>
                <div className={styles.sessionToolbarRight}>
                  <div className={styles.sessionSortWrap}>
                    <span className={styles.sessionSortLabel}>정렬</span>
                    <select
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as 'recent' | 'name')}
                      className={styles.sessionSortSelect}
                    >
                      <option value="recent">최근 활동순</option>
                      <option value="name">이름순</option>
                    </select>
                  </div>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={toggleSelectionMode}
                    className={styles.sessionSelectionModeBtn}
                    title={isSelectionMode ? '선택 모드 종료' : '선택 모드'}
                    aria-label={isSelectionMode ? '선택 모드 종료' : '선택 모드'}
                  >
                    {isSelectionMode ? <X size={18} /> : <Square size={18} />}
                  </Button>
                </div>
              </div>

              {isSelectionMode && (
                <div className={styles.sessionSelectionToolbar}>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={toggleSelectAllVisibleSessions}
                    disabled={filteredSessions.length === 0}
                    className={styles.sessionIconActionBtn}
                    title={allVisibleSelected ? '전체 선택 해제' : '전체 선택'}
                    aria-label={allVisibleSelected ? '전체 선택 해제' : '전체 선택'}
                  >
                    <Check size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={clearSelectedSessions}
                    disabled={selectedCount === 0}
                    className={styles.sessionIconActionBtn}
                    title="선택 해제"
                    aria-label="선택 해제"
                  >
                    <X size={16} />
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => requestDeleteSessions(Array.from(selectedSessionIds))}
                    disabled={selectedCount === 0}
                    className={`${styles.sessionIconActionBtn} ${styles.sessionIconDeleteBtn}`}
                    title={`선택 삭제 (${selectedCount})`}
                    aria-label={`선택 삭제 (${selectedCount})`}
                  >
                    <Trash2 size={16} />
                  </Button>
                </div>
              )}

              {filteredSessions.length === 0 ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  검색 결과가 없습니다.
                </div>
              ) : (
                <div className={styles.sessionGrid}>
                  {filteredSessions.map((session) => {
                    const agentInfo = getAgentOption(session.agent);
                    const AgentIcon = agentInfo.Icon;
                    const isPinned = pinnedSessions.has(session.id);
                    const displayName = sessionAliases[session.id]?.trim() || extractLastDirectoryName(session.projectName);
                    const isMenuOpen = openMenuId === session.id;
                    const isSelected = selectedSessionIds.has(session.id);

                    return (
                      <div 
                        key={session.id} 
                        className={`${styles.sessionCard} ${isSelected ? styles.sessionCardSelected : ''}`}
                        style={{ zIndex: isMenuOpen ? 100 : 1 }}
                      >
                        {isSelectionMode && (
                          <button
                            type="button"
                            className={`${styles.sessionSelectToggle} ${isSelected ? styles.sessionSelectToggleActive : ''}`}
                            onClick={(e) => toggleSessionSelection(session.id, e)}
                            aria-label={isSelected ? '세션 선택 해제' : '세션 선택'}
                          >
                            {isSelected ? <Check size={14} /> : null}
                          </button>
                        )}
                        {isPinned && (
                          <div className={styles.pinBadge}>
                            <Pin size={12} fill="currentColor" />
                          </div>
                        )}
                        <div className={styles.sessionCardHeader}>
                          <div className={`${styles.sessionCardHeaderMain} ${isSelectionMode ? styles.sessionCardHeaderMainSelectable : ''}`}>
                            <div className={styles.sessionCardTitle} title={session.projectName}>{displayName}</div>
                            <div className={styles.sessionCardId}>{session.id.slice(0, 10)}...</div>
                          </div>
                          <div className={styles.sessionCardMenuAnchor} data-session-menu-anchor>
                            <button 
                              type="button"
                              className={styles.sessionMenuBtn} 
                              onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : session.id); }}
                            >
                              <MoreVertical size={20} />
                            </button>
                            {isMenuOpen && (
                              <div className={styles.dropdownMenu}>
                                <Link 
                                  href={`/sessions/${session.id}`} 
                                  className={styles.dropdownItem} 
                                  onClick={() => setOpenMenuId(null)}
                                >
                                  <ArrowUpRight size={16} /> 세션 접속
                                </Link>
                                <button type="button" className={styles.dropdownItem} onClick={(e) => openRenameModal(session, e)}>
                                  <Edit2 size={16} /> 이름 변경
                                </button>
                                <button type="button" className={styles.dropdownItem} onClick={(e) => togglePin(session.id, e)}>
                                  <Pin size={16} /> {isPinned ? '고정 해제' : '상단 고정'}
                                </button>
                                <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--line)' }} />
                                <button type="button" className={styles.dropdownItem} onClick={(e) => executeSessionAction(session.id, 'retry', e)}>
                                  <RotateCw size={16} /> 세션 재실행
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                                  onClick={(e) => executeSessionAction(session.id, 'abort', e)}
                                >
                                  <Square size={16} /> 세션 종료
                                </button>
                                <button
                                  type="button"
                                  className={`${styles.dropdownItem} ${styles.dropdownItemDanger}`}
                                  onClick={(e) => executeSessionAction(session.id, 'kill', e)}
                                >
                                  <Trash2 size={16} /> 세션 삭제
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className={styles.sessionCardBody}>
                          <div className={styles.sessionCardAgent} style={{ color: agentInfo.accentColor }}>
                            <div className={styles.sessionCardAgentIcon} style={{ backgroundColor: agentInfo.accentBg }}>
                              <AgentIcon size={18} />
                            </div>
                            {agentInfo.label}
                          </div>
                          <div>
                            <Badge variant={session.status === 'running' ? 'emerald' : 'amber'}>
                              {session.status}
                            </Badge>
                          </div>
                        </div>

                        <div className={styles.sessionCardMeta}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <Clock3 size={14} /> {formatHistoryDate(session.lastActivityAt || '')}
                          </span>
                          <Link href={`/sessions/${session.id}`} className="btn-ghost" style={{ padding: '0.25rem 0.5rem', minHeight: 'unset', fontSize: '0.8rem', fontWeight: 700, color: 'var(--primary)' }}>
                            열기
                          </Link>
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

      {pendingDeleteSessionIds && (
        <div className="modal-overlay" onClick={() => { if (!isDeletingSessions) setPendingDeleteSessionIds(null); }}>
          <div className="modal-content new-session-modal rename-modal animate-in" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h3 className="modal-title" style={{ fontSize: '1rem' }}>세션 삭제 확인</h3>
            </header>
            <div className="modal-body" style={{ padding: '1.25rem 1.5rem' }}>
              <p style={{ marginBottom: '0.5rem', fontWeight: 700 }}>
                선택한 {pendingDeleteSessionIds.length}개 세션을 삭제하시겠습니까?
              </p>
              <p className="text-muted text-sm">삭제된 세션은 복구할 수 없습니다.</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
                <Button type="button" variant="ghost" onClick={() => setPendingDeleteSessionIds(null)} disabled={isDeletingSessions}>
                  취소
                </Button>
                <Button
                  type="button"
                  isLoading={isDeletingSessions}
                  onClick={() => void confirmDeleteSessions()}
                  style={{ background: 'var(--accent-red)', color: '#fff' }}
                >
                  삭제
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Rename Modal */}
      {renameModalSession && (
        <div className="modal-overlay" onClick={() => setRenameModalSession(null)}>
          <div className="modal-content new-session-modal rename-modal animate-in" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <h3 className="modal-title" style={{ fontSize: '1rem' }}>세션 이름 변경</h3>
            </header>
            <form onSubmit={saveRename} className="modal-body" style={{ padding: '1.25rem 1.5rem' }}>
              <Input 
                autoFocus
                value={newNameInput} 
                onChange={e => setNewNameInput(e.target.value)} 
                placeholder="새로운 이름 입력..."
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '1.25rem' }}>
                <Button type="button" variant="ghost" onClick={() => setRenameModalSession(null)}>취소</Button>
                <Button type="submit" className="btn-primary">저장</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
