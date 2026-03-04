'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { 
  Play, Terminal, FolderOpen, Search, PlusCircle, X, Plus, 
  Clock3, ArrowUpRight, Folder, ArrowUp, Check, ChevronDown, ChevronUp,
  MoreVertical, Activity, Pin, Edit2, RotateCw, Square, Trash2
} from 'lucide-react';
import { Button, Input, Card, Badge } from '@/components/ui';
import type { SessionSummary } from '@/lib/happy/types';
import { ClaudeIcon, GeminiIcon, CodexIcon } from '@/components/ui/AgentIcons';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';

type AgentFlavor = 'claude' | 'codex' | 'gemini';

type PathHistoryEntry = {
  path: string;
  agent: AgentFlavor;
  lastUsedAt: string;
  sessionId?: string;
};

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

function isAgentFlavor(value: unknown): value is AgentFlavor {
  return value === 'claude' || value === 'codex' || value === 'gemini';
}

function resolveAgent(value: unknown): AgentFlavor {
  return isAgentFlavor(value) ? value : 'claude';
}

function getAgentOption(value: unknown): AgentOption {
  const agent = resolveAgent(value);
  return AGENT_OPTIONS.find((item) => item.id === agent) ?? AGENT_OPTIONS[0];
}

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
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  // Directory Browser States
  const [isBrowsing, setIsBrowsing] = useState(false);
  const [browserPath, setBrowserPath] = useState('/');
  const [directories, setDirectories] = useState<DirectoryInfo[]>([]);
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [isLoadingDirs, setIsLoadingDirs] = useState(false);

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

  // Local mutation state
  const [sessionsList, setSessionsList] = useState<SessionSummary[]>(initialSessions);

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
            lastUsedAt: normalizeDate(item.lastUsedAt),
            sessionId: item.sessionId ? String(item.sessionId) : undefined,
          })));
        }
      } catch (e) {
        console.error('Failed to parse path history', e);
      }
    }

    const handleClickOutside = () => setOpenMenuId(null);
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
  }, [isBrowsing]);

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

  function recordHistory(pathInput: string, agent: AgentFlavor, sessionId?: string) {
    const path = sanitizePath(pathInput);
    if (!path) return;
    setPathHistory((prev) => {
      const next = [
        { path, agent, lastUsedAt: new Date().toISOString(), sessionId },
        ...prev.filter((item) => item.path !== path),
      ];
      return next.slice(0, MAX_PATH_HISTORY_ITEMS);
    });
  }

  async function createSession(pathInput: string, agentInput: AgentFlavor) {
    if (!isOperator) return;
    const path = sanitizePath(pathInput);
    if (!path) { setError('프로젝트 경로를 입력해 주세요.'); return; }

    setError(null);
    setIsCreating(true);
    try {
      const response = await fetch('/api/runtime/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, agent: agentInput }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? '세션 생성에 실패했습니다.');
      const sessionId = body.session?.id;
      if (!sessionId) throw new Error('세션 생성 응답이 올바르지 않습니다.');

      recordHistory(path, agentInput, sessionId);
      router.push(`/sessions/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    await createSession(newPath, newAgent);
  }

  async function handleQuickResume(entry: PathHistoryEntry) {
    if (!isOperator || isCreating) return;
    if (entry.sessionId && sessionsList.some((s) => s.id === entry.sessionId)) {
      recordHistory(entry.path, entry.agent, entry.sessionId);
      router.push(`/sessions/${entry.sessionId}`);
      return;
    }
    await createSession(entry.path, entry.agent);
  }

  function applyHistory(entry: PathHistoryEntry) {
    setNewPath(entry.path);
    setNewAgent(entry.agent);
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
    try {
      const res = await fetch(`/api/runtime/sessions/${id}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) throw new Error(`Action ${action} failed`);
      
      if (action === 'kill') {
        setSessionsList(prev => prev.filter(s => s.id !== id));
      } else {
        // Optimistic status update (could be refined with real time events)
        setSessionsList(prev => prev.map(s => {
          if (s.id === id) {
            return { ...s, status: action === 'abort' ? 'stopped' : 'running' };
          }
          return s;
        }));
      }
    } catch (err) {
      console.error(err);
      alert(`${action} 요청 중 오류가 발생했습니다.`);
    }
  };

  const sessionStats = useMemo(() => {
    const total = sessionsList.length;
    const running = sessionsList.filter((s) => s.status === 'running').length;
    const idle = total - running;
    return { total, running, idle };
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
        const displayName = sessionAliases[session.id] || session.projectName;
        if (!normalizedQuery) return true;
        return (
          displayName.toLowerCase().includes(normalizedQuery) ||
          session.id.toLowerCase().includes(normalizedQuery) ||
          String(session.agent).toLowerCase().includes(normalizedQuery)
        );
      })
      .sort((a, b) => {
        const aPinned = pinnedSessions.has(a.id) ? 1 : 0;
        const bPinned = pinnedSessions.has(b.id) ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned; // Pinned first

        if (sortBy === 'name') {
          const aName = sessionAliases[a.id] || a.projectName;
          const bName = sessionAliases[b.id] || b.projectName;
          return aName.localeCompare(bName);
        }

        const aTime = Date.parse(a.lastActivityAt || FALLBACK_DATE_ISO);
        const bTime = Date.parse(b.lastActivityAt || FALLBACK_DATE_ISO);
        return bTime - aTime;
      });
  }, [sessionsList, searchQuery, sortBy, pinnedSessions, sessionAliases]);

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
                <label className="section-label" htmlFor="project-path">Project Path</label>
                <div className="input-group">
                  <Input
                    id="project-path"
                    name="projectPath"
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="/home/user/my-project"
                    required
                    disabled={!isOperator || isCreating}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsBrowsing(!isBrowsing)}
                    disabled={!isOperator || isCreating}
                    className="browse-btn"
                    title="디렉토리 탐색기 열기/닫기"
                  >
                    {isBrowsing ? <ChevronUp size={18} /> : <Search size={18} />}
                  </Button>
                </div>

                {isBrowsing && (
                  <div className="directory-browser animate-in">
                    <div className="browser-header">
                      <span className="current-path-display">
                        <span className="path-prefix">/workspace</span>
                        {browserPath !== '/' ? browserPath : ''}
                      </span>
                      <Button 
                        type="button"
                        variant="primary" 
                        className="select-current-btn"
                        onClick={() => {
                          setNewPath(`/workspace${browserPath === '/' ? '' : browserPath}`);
                          setIsBrowsing(false);
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
                )}
              </div>

              {pathHistory.length > 0 && !isBrowsing && (
                <div className="form-section">
                  <div className="section-header">
                    <label className="section-label">Recent History</label>
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
                <label className="section-label">Agent Flavor</label>
                <div className="agent-selection-grid">
                  {AGENT_OPTIONS.map((agent) => {
                    const AgentIcon = agent.Icon;
                    const isSelected = newAgent === agent.id;

                    return (
                      <button
                        key={agent.id}
                        type="button"
                        className={`agent-select-card ${isSelected ? 'active' : ''}`}
                        onClick={() => setNewAgent(agent.id)}
                      >
                        <div className="agent-visual" style={{ backgroundColor: agent.accentBg, color: agent.accentColor }}>
                          <AgentIcon size={20} />
                        </div>
                        <div className="agent-details">
                          <div className="agent-label">{agent.label}</div>
                          <div className="agent-desc">{agent.subtitle}</div>
                        </div>
                      </button>
                    );
                  })}
                </div>
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

  // Pie chart data
  const pieData = [
    { name: '사용중', value: 35, color: '#3b82f6' },
    { name: '여유', value: 65, color: '#e2e8f0' },
  ];

  return (
    <div style={{ position: 'relative' }}>
      <div className="dashboard-title-row">
        <div className="dashboard-title-group">
          <h2 className="title-lg" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Activity size={28} color="var(--primary)" /> Workspace
          </h2>
          <p className="text-sm text-muted">에이전트 세션과 리소스를 효율적으로 관리하세요.</p>
        </div>
        {isOperator && (
          <Button
            type="button"
            onClick={() => {
              setError(null);
              setIsBrowsing(false);
              setIsCreateModalOpen(true);
            }}
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
              onClick={() => {
                setError(null);
                setIsBrowsing(false);
                setIsCreateModalOpen(true);
              }}
              disabled={!isOperator}
              className="empty-state-primary-action btn-primary"
              style={{ borderRadius: '99px', marginTop: '2rem' }}
            >
              <PlusCircle size={18} /> 첫 세션 시작하기
            </Button>
          </Card>
        ) : (
          <div className="session-dashboard-layout">
            <aside className="session-dashboard-sidebar">
              
              {/* Server Status Apple-Style Card */}
              <Card className="session-sidebar-card">
                <h3 className="session-sidebar-title">
                  <Activity size={16} color="var(--primary)" /> 서버 리소스
                </h3>
                <div style={{ height: '140px', width: '100%', position: 'relative' }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={60}
                        startAngle={90}
                        endAngle={-270}
                        dataKey="value"
                        stroke="none"
                        cornerRadius={10}
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', textAlign: 'center' }}>
                    <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--text)' }}>35%</div>
                    <div style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-muted)' }}>CPU/MEM</div>
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-muted)' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }}></span> 사용중
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                    <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#e2e8f0' }}></span> 여유
                  </span>
                </div>
              </Card>

              {/* Session Status */}
              <Card className="session-sidebar-card">
                <h3 className="session-sidebar-title">
                  <Terminal size={16} color="var(--accent-violet)" /> 세션 현황
                </h3>
                <div className="session-sidebar-stats">
                  <div className="session-stat-item total">
                    <span className="session-stat-value">{sessionStats.total}</span>
                    <span className="session-stat-label">전체</span>
                  </div>
                  <div className="session-stat-item running">
                    <span className="session-stat-value" style={{ color: 'var(--accent-emerald)' }}>{sessionStats.running}</span>
                    <span className="session-stat-label">실행중</span>
                  </div>
                  <div className="session-stat-item idle">
                    <span className="session-stat-value" style={{ color: 'var(--accent-amber)' }}>{sessionStats.idle}</span>
                    <span className="session-stat-label">대기</span>
                  </div>
                </div>
              </Card>

              {/* Agents */}
              <Card className="session-sidebar-card">
                <h3 className="session-sidebar-title">에이전트 분포</h3>
                <div className="session-agent-stats">
                  {AGENT_OPTIONS.map(agent => (
                    <div key={agent.id} className="session-agent-stat-row">
                      <div className="session-agent-stat-left">
                        <div style={{ width: 28, height: 28, borderRadius: 8, background: agent.accentBg, color: agent.accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <agent.Icon size={16} />
                        </div>
                        {agent.label}
                      </div>
                      <div className="session-agent-stat-right" style={{ color: agentStats[agent.id] > 0 ? 'var(--text)' : 'var(--text-muted)' }}>
                        {agentStats[agent.id]}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            </aside>

            <section className="session-dashboard-main">
              <div className="session-main-toolbar">
                <div className="session-search-wrap">
                  <Search size={18} color="var(--text-muted)" />
                  <input
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="프로젝트, 세션 이름 검색..."
                    className="session-search-input"
                  />
                </div>
                <div className="session-sort-wrap">
                  <span className="session-sort-label">정렬</span>
                  <select
                    value={sortBy}
                    onChange={(e) => setSortBy(e.target.value as 'recent' | 'name')}
                    className="session-sort-select"
                  >
                    <option value="recent">최근 활동순</option>
                    <option value="name">이름순</option>
                  </select>
                </div>
              </div>

              {filteredSessions.length === 0 ? (
                <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                  검색 결과가 없습니다.
                </div>
              ) : (
                <div className="session-grid">
                  {filteredSessions.map((session) => {
                    const agentInfo = getAgentOption(session.agent);
                    const AgentIcon = agentInfo.Icon;
                    const isPinned = pinnedSessions.has(session.id);
                    const displayName = sessionAliases[session.id] || session.projectName;
                    const isMenuOpen = openMenuId === session.id;

                    return (
                      <div key={session.id} className="session-card">
                        {isPinned && (
                          <div className="pin-badge">
                            <Pin size={12} fill="currentColor" />
                          </div>
                        )}
                        <div className="session-card-header">
                          <div>
                            <div className="session-card-title" title={displayName}>{displayName}</div>
                            <div className="session-card-id">{session.id.slice(0, 10)}...</div>
                          </div>
                          <div style={{ position: 'relative' }}>
                            <button 
                              className="session-menu-btn" 
                              onClick={(e) => { e.stopPropagation(); setOpenMenuId(isMenuOpen ? null : session.id); }}
                            >
                              <MoreVertical size={20} />
                            </button>
                            {isMenuOpen && (
                              <div className="dropdown-menu">
                                <Link 
                                  href={`/sessions/${session.id}`} 
                                  className="dropdown-item" 
                                  onClick={() => setOpenMenuId(null)}
                                >
                                  <ArrowUpRight size={16} /> 세션 접속
                                </Link>
                                <button className="dropdown-item" onClick={(e) => openRenameModal(session, e)}>
                                  <Edit2 size={16} /> 이름 변경
                                </button>
                                <button className="dropdown-item" onClick={(e) => togglePin(session.id, e)}>
                                  <Pin size={16} /> {isPinned ? '고정 해제' : '상단 고정'}
                                </button>
                                <hr style={{ margin: '4px 0', border: 'none', borderTop: '1px solid var(--line)' }} />
                                <button className="dropdown-item" onClick={(e) => executeSessionAction(session.id, 'retry', e)}>
                                  <RotateCw size={16} /> 세션 재실행
                                </button>
                                <button className="dropdown-item danger" onClick={(e) => executeSessionAction(session.id, 'abort', e)}>
                                  <Square size={16} /> 세션 종료
                                </button>
                                <button className="dropdown-item danger" onClick={(e) => executeSessionAction(session.id, 'kill', e)}>
                                  <Trash2 size={16} /> 세션 삭제
                                </button>
                              </div>
                            )}
                          </div>
                        </div>

                        <div className="session-card-body">
                          <div className="session-card-agent" style={{ color: agentInfo.accentColor }}>
                            <div className="session-card-agent-icon" style={{ backgroundColor: agentInfo.accentBg }}>
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

                        <div className="session-card-meta">
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
