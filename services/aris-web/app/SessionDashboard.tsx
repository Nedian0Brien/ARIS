'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Play, Terminal, BrainCircuit, FolderOpen, Search, PlusCircle, X, Plus, Code, Sparkles, Clock3, ArrowUpRight } from 'lucide-react';
import { Button, Input, Card, Badge } from '@/components/ui';
import { DirectoryModal } from '@/components/ui/DirectoryModal';
import type { SessionSummary } from '@/lib/happy/types';

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
  Icon: LucideIcon;
  accentColor: string;
  accentBg: string;
};

const PATH_HISTORY_STORAGE_KEY = 'aris:new-session-path-history';
const MAX_PATH_HISTORY_ITEMS = 8;
const FALLBACK_DATE_ISO = '1970-01-01T00:00:00.000Z';

const AGENT_OPTIONS: AgentOption[] = [
  {
    id: 'claude',
    label: 'Claude',
    subtitle: 'Balanced coding flow',
    Icon: BrainCircuit,
    accentColor: 'var(--accent-violet)',
    accentBg: 'var(--accent-violet-bg)',
  },
  {
    id: 'codex',
    label: 'Codex',
    subtitle: 'Fast implementation',
    Icon: Code,
    accentColor: 'var(--primary)',
    accentBg: 'rgba(59, 130, 246, 0.14)',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    subtitle: 'Broad reasoning',
    Icon: Sparkles,
    accentColor: 'var(--accent-emerald)',
    accentBg: 'var(--accent-emerald-bg)',
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

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeStorageEntry(value: unknown): PathHistoryEntry | null {
  if (typeof value === 'string') {
    const path = sanitizePath(value);
    return path
      ? {
          path,
          agent: 'claude',
          lastUsedAt: FALLBACK_DATE_ISO,
        }
      : null;
  }

  const rec = toRecord(value);
  if (!rec) {
    return null;
  }

  const path = sanitizePath(typeof rec.path === 'string' ? rec.path : '');
  if (!path) {
    return null;
  }

  const sessionId = typeof rec.sessionId === 'string' && rec.sessionId ? rec.sessionId : undefined;

  return {
    path,
    agent: resolveAgent(rec.agent),
    lastUsedAt: normalizeDate(rec.lastUsedAt),
    sessionId,
  };
}

function readHistoryFromStorage(): PathHistoryEntry[] {
  if (typeof window === 'undefined') {
    return [];
  }

  try {
    const raw = window.localStorage.getItem(PATH_HISTORY_STORAGE_KEY);
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed
      .map((entry) => normalizeStorageEntry(entry))
      .filter((entry): entry is PathHistoryEntry => entry !== null)
      .slice(0, MAX_PATH_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function mergePathHistory(runtimeSessions: SessionSummary[], localHistory: PathHistoryEntry[]): PathHistoryEntry[] {
  const map = new Map<string, PathHistoryEntry>();

  const upsert = (entry: PathHistoryEntry) => {
    const current = map.get(entry.path);
    if (!current || entry.lastUsedAt > current.lastUsedAt) {
      map.set(entry.path, entry);
    }
  };

  for (const item of localHistory) {
    upsert(item);
  }

  for (const session of runtimeSessions) {
    const path = sanitizePath(session.projectName);
    if (!path || path === 'unknown-project') {
      continue;
    }

    upsert({
      path,
      agent: resolveAgent(session.agent),
      lastUsedAt: normalizeDate(session.lastActivityAt),
      sessionId: session.id,
    });
  }

  return [...map.values()]
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, MAX_PATH_HISTORY_ITEMS);
}

function formatHistoryDate(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || value === FALLBACK_DATE_ISO) {
    return '최근 사용';
  }

  return parsed.toLocaleDateString();
}

export function SessionDashboard({
  initialSessions,
  isOperator,
}: {
  initialSessions: SessionSummary[];
  isOperator: boolean;
}) {
  const [newPath, setNewPath] = useState('');
  const [newAgent, setNewAgent] = useState<AgentFlavor>('claude');
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDirModalOpen, setIsDirModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [localHistory, setLocalHistory] = useState<PathHistoryEntry[]>([]);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    setLocalHistory(readHistoryFromStorage());

    return () => setMounted(false);
  }, []);

  const pathHistory = useMemo(() => mergePathHistory(initialSessions, localHistory), [initialSessions, localHistory]);

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PATH_HISTORY_STORAGE_KEY, JSON.stringify(pathHistory));
  }, [mounted, pathHistory]);

  function recordHistory(pathInput: string, agent: AgentFlavor, sessionId?: string) {
    const path = sanitizePath(pathInput);
    if (!path) {
      return;
    }

    setLocalHistory((prev) => {
      const next = [
        {
          path,
          agent,
          lastUsedAt: new Date().toISOString(),
          sessionId,
        },
        ...prev.filter((item) => item.path !== path),
      ];

      return next.slice(0, MAX_PATH_HISTORY_ITEMS);
    });
  }

  async function createSession(pathInput: string, agentInput: AgentFlavor) {
    if (!isOperator) {
      return;
    }

    const path = sanitizePath(pathInput);
    if (!path) {
      setError('프로젝트 경로를 입력해 주세요.');
      return;
    }

    setError(null);
    setIsCreating(true);

    try {
      const response = await fetch('/api/runtime/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path, agent: agentInput }),
      });

      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        session?: { id?: string };
      };

      if (!response.ok) {
        throw new Error(body.error ?? '세션 생성에 실패했습니다.');
      }

      const sessionId = body.session?.id;
      if (!sessionId) {
        throw new Error('세션 생성 응답이 올바르지 않습니다.');
      }

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
    if (!isOperator || isCreating) {
      return;
    }

    if (entry.sessionId && initialSessions.some((session) => session.id === entry.sessionId)) {
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

  const createModal = isCreateModalOpen && mounted
    ? createPortal(
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content create-session-modal animate-in" onClick={(e) => e.stopPropagation()} style={{ padding: 0 }}>
            <div className="create-session-header">
              <div className="create-session-title-wrap">
                <div className="create-session-badge">
                  <PlusCircle size={18} />
                </div>
                <div>
                  <h3 className="title-sm">새 세션 시작</h3>
                  <p className="text-sm text-muted">최근 경로를 선택하거나 새로운 경로로 바로 시작할 수 있습니다.</p>
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={() => setIsCreateModalOpen(false)}
                style={{ padding: '0.25rem', minHeight: 'auto', borderRadius: 'var(--radius-full)' }}
              >
                <X size={20} />
              </Button>
            </div>

            <form onSubmit={handleCreateSession} className="create-session-form no-scrollbar">
              <section className="modal-block">
                <label className="text-sm block-title">Project Path</label>
                <div className="path-row">
                  <Input
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="/workspace/my-app"
                    required
                    disabled={!isOperator || isCreating}
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsDirModalOpen(true)}
                    disabled={!isOperator || isCreating}
                    style={{ padding: '0 0.75rem' }}
                  >
                    <Search size={18} />
                  </Button>
                </div>
              </section>

              {pathHistory.length > 0 && (
                <section className="modal-block">
                  <div className="block-head">
                    <span className="text-sm block-title">Recent Paths</span>
                    <span className="text-sm text-muted">{pathHistory.length}개</span>
                  </div>

                  <div className="history-list no-scrollbar">
                    {pathHistory.map((entry) => {
                      const agent = getAgentOption(entry.agent);
                      const AgentIcon = agent.Icon;
                      const hasLiveSession = Boolean(entry.sessionId && initialSessions.some((session) => session.id === entry.sessionId));

                      return (
                        <div key={`${entry.path}-${entry.sessionId ?? 'new'}`} className="history-item">
                          <button
                            type="button"
                            className={`history-main ${sanitizePath(newPath) === entry.path ? 'is-active' : ''}`}
                            onClick={() => applyHistory(entry)}
                            disabled={!isOperator || isCreating}
                          >
                            <span className="history-path">{entry.path}</span>
                            <span className="history-meta">
                              <span className="history-agent" style={{ color: agent.accentColor }}>
                                <AgentIcon size={12} /> {agent.label}
                              </span>
                              <span className="history-date">
                                <Clock3 size={12} /> {formatHistoryDate(entry.lastUsedAt)}
                              </span>
                            </span>
                          </button>

                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void handleQuickResume(entry)}
                            disabled={!isOperator || isCreating}
                            className="history-action"
                          >
                            {hasLiveSession ? <ArrowUpRight size={13} /> : <Play size={13} fill="currentColor" />} {hasLiveSession ? '열기' : '재개'}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="modal-block">
                <label className="text-sm block-title">Agent Flavor</label>
                <div className="agent-grid" role="radiogroup" aria-label="Agent Flavor">
                  {AGENT_OPTIONS.map((agent) => {
                    const AgentIcon = agent.Icon;
                    const isSelected = newAgent === agent.id;

                    return (
                      <button
                        key={agent.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`agent-card ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setNewAgent(agent.id)}
                        disabled={!isOperator || isCreating}
                      >
                        <span className="agent-logo" style={{ background: agent.accentBg, color: agent.accentColor }}>
                          <AgentIcon size={16} />
                        </span>
                        <div className="agent-info">
                          <span className="agent-name">{agent.label}</span>
                          <span className="agent-subtitle">{agent.subtitle}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </section>

              {error && <div className="text-sm" style={{ color: 'var(--accent-red)' }}>{error}</div>}

              <div className="modal-actions">
                <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)} style={{ flex: 1 }}>
                  취소
                </Button>
                <Button type="submit" isLoading={isCreating} disabled={!isOperator || !sanitizePath(newPath)} style={{ flex: 2 }}>
                  <Play size={16} fill="currentColor" /> 세션 시작
                </Button>
              </div>
            </form>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h2 className="title-md" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Terminal size={24} color="var(--primary)" /> Active Sessions
        </h2>
        {isOperator && (
          <Button
            onClick={() => {
              setError(null);
              setIsCreateModalOpen(true);
            }}
            className="desktop-create-button"
          >
            <Plus size={18} /> 새 세션
          </Button>
        )}
      </div>

      <div className="animate-in">
        {initialSessions.length === 0 ? (
          <Card style={{ padding: '4rem 2rem', textAlign: 'center', backgroundColor: 'var(--surface-subtle)', borderStyle: 'dashed' }}>
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1rem', color: 'var(--text-muted)' }}>
              <FolderOpen size={68} strokeWidth={1.5} />
            </div>
            <h3 className="title-sm" style={{ marginBottom: '0.5rem' }}>활성화된 세션이 없습니다</h3>
            <p className="text-muted text-sm" style={{ margin: '0 auto', maxWidth: '320px' }}>
              아직 실행 중인 세션이 없습니다. 프로젝트 경로를 지정해서 첫 세션을 시작해 보세요.
            </p>
            <Button
              onClick={() => {
                setError(null);
                setIsCreateModalOpen(true);
              }}
              disabled={!isOperator}
              className="empty-state-primary-action"
            >
              <PlusCircle size={18} /> 첫 세션 시작하기
            </Button>
          </Card>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1rem' }}>
            {initialSessions.map((session) => (
              <Link key={session.id} href={`/sessions/${session.id}`}>
                <Card style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', cursor: 'pointer', height: '100%' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: 'var(--surface-soft)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {session.agent === 'claude' ? <BrainCircuit size={24} color="var(--accent-violet)" /> : <Terminal size={24} color="var(--primary)" />}
                    </div>
                    <Badge variant={session.status === 'running' ? 'emerald' : 'amber'}>
                      {session.status}
                    </Badge>
                  </div>

                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem', wordBreak: 'break-all' }}>{session.projectName}</div>
                    <div className="text-sm text-muted">
                      {session.agent.toUpperCase()} Agent
                    </div>
                  </div>

                  <div style={{ borderTop: '1px solid var(--line)', paddingTop: '1rem', marginTop: 'auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div className="text-sm text-muted" style={{ fontSize: '0.75rem' }}>
                      {new Date(session.lastActivityAt || '').toLocaleDateString()}
                    </div>
                    <div style={{ color: 'var(--primary)', fontWeight: 600, fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                      워크스페이스 <Play size={14} fill="currentColor" />
                    </div>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      <div
        className="fab"
        onClick={() => {
          setError(null);
          setIsCreateModalOpen(true);
        }}
      >
        <Plus size={28} />
      </div>

      {createModal}

      <DirectoryModal
        isOpen={isDirModalOpen}
        onClose={() => setIsDirModalOpen(false)}
        onSelect={(path) => setNewPath(path)}
      />

      <style jsx>{`
        .desktop-create-button {
          display: none;
        }

        .empty-state-primary-action {
          display: inline-flex;
          width: fit-content;
          margin: 2rem auto 0;
        }

        .create-session-modal {
          width: calc(100% - 2rem);
          max-width: 760px !important;
          max-height: min(86vh, 760px);
          border: 1px solid var(--line);
          background: var(--surface);
        }

        .create-session-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--line);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
          background: linear-gradient(180deg, rgba(248, 250, 252, 0.9) 0%, rgba(248, 250, 252, 0.55) 100%);
        }

        .create-session-title-wrap {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .create-session-badge {
          width: 2rem;
          height: 2rem;
          border-radius: var(--radius-md);
          background: rgba(59, 130, 246, 0.12);
          color: var(--primary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-top: 0.05rem;
        }

        .create-session-form {
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          padding: 1rem;
          overflow-y: auto;
        }

        .modal-block {
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          background: var(--surface);
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .block-title {
          font-weight: 700;
          letter-spacing: -0.01em;
        }

        .block-head {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
        }

        .path-row {
          display: flex;
          gap: 0.5rem;
        }

        .history-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 168px;
          overflow-y: auto;
          padding-right: 0.15rem;
        }

        .history-item {
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          background: var(--surface-subtle);
          display: flex;
          align-items: stretch;
          gap: 0.45rem;
          padding: 0.4rem;
          min-width: 0;
        }

        .history-main {
          flex: 1;
          min-width: 0;
          border-radius: var(--radius-sm);
          padding: 0.35rem 0.45rem;
          display: flex;
          flex-direction: column;
          justify-content: center;
          align-items: flex-start;
          gap: 0.3rem;
          text-align: left;
          transition: background-color 0.2s ease;
        }

        .history-main:hover:not(:disabled) {
          background: rgba(59, 130, 246, 0.08);
        }

        .history-main.is-active {
          background: rgba(59, 130, 246, 0.12);
        }

        .history-path {
          width: 100%;
          font-size: 0.84rem;
          font-weight: 700;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .history-meta {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          font-size: 0.72rem;
          color: var(--text-muted);
        }

        .history-agent,
        .history-date {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
        }

        .history-action {
          min-height: 36px;
          padding: 0.35rem 0.55rem;
          font-size: 0.75rem;
          white-space: nowrap;
          align-self: center;
          flex-shrink: 0;
        }

        .agent-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.55rem;
        }

        .agent-card {
          border: 1px solid var(--line-strong);
          border-radius: var(--radius-md);
          background: var(--surface);
          padding: 0.75rem;
          text-align: left;
          display: flex;
          align-items: center;
          gap: 0.75rem;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
          min-width: 0;
          cursor: pointer;
        }

        .agent-card:hover:not(:disabled) {
          border-color: rgba(59, 130, 246, 0.45);
          box-shadow: var(--shadow-sm);
        }

        .agent-card.is-selected {
          border-color: rgba(59, 130, 246, 0.7);
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.14);
          background: linear-gradient(180deg, rgba(248, 250, 252, 1) 0%, rgba(241, 245, 249, 0.86) 100%);
        }

        .agent-logo {
          width: 32px;
          height: 32px;
          border-radius: var(--radius-sm);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .agent-info {
          display: flex;
          flex-direction: column;
          min-width: 0;
          gap: 0.15rem;
        }

        .agent-name {
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--text);
          line-height: 1.2;
        }

        .agent-subtitle {
          font-size: 0.75rem;
          color: var(--text-muted);
          line-height: 1.3;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .modal-actions {
          display: flex;
          gap: 0.75rem;
          padding-top: 0.15rem;
        }

        @media (max-width: 767px) {
          .empty-state-primary-action {
            display: none;
          }

          .create-session-header {
            padding: 0.95rem 1rem;
          }

          .create-session-form {
            padding: 0.85rem;
          }

          .history-item {
            flex-direction: column;
          }

          .history-action {
            width: 100%;
          }
          
          .agent-subtitle {
            white-space: normal;
          }
        }

        @media (min-width: 768px) {
          .desktop-create-button {
            display: inline-flex !important;
          }

          .empty-state-primary-action {
            display: inline-flex !important;
          }

          .agent-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .agent-card {
            min-height: 110px;
            flex-direction: column;
            align-items: flex-start;
            justify-content: flex-start;
            gap: 0.85rem;
          }
          
          .agent-subtitle {
            white-space: normal;
          }
        }
      `}</style>
    </div>
  );
}
