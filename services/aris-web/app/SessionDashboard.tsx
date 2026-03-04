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
          <div className="modal-content new-session-modal animate-in" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="header-title-group">
                <div className="header-icon-box">
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 className="modal-title">새 세션 시작</h3>
                  <p className="modal-subtitle">프로젝트 경로와 에이전트를 선택하여 시작하세요.</p>
                </div>
              </div>
              <Button variant="ghost" onClick={() => setIsCreateModalOpen(false)} className="close-btn">
                <X size={22} />
              </Button>
            </header>

            <form onSubmit={handleCreateSession} className="modal-body no-scrollbar">
              <div className="form-section">
                <label className="section-label">Project Path</label>
                <div className="input-group">
                  <Input
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="/home/user/my-project"
                    required
                    disabled={!isOperator || isCreating}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsDirModalOpen(true)}
                    disabled={!isOperator || isCreating}
                    className="browse-btn"
                  >
                    <Search size={18} />
                  </Button>
                </div>
              </div>

              {pathHistory.length > 0 && (
                <div className="form-section">
                  <div className="section-header">
                    <label className="section-label">Recent History</label>
                    <span className="count-badge">{pathHistory.length}</span>
                  </div>
                  <div className="history-stack">
                    {pathHistory.map((entry) => {
                      const agent = getAgentOption(entry.agent);
                      const AgentIcon = agent.Icon;
                      const isLive = Boolean(entry.sessionId && initialSessions.some(s => s.id === entry.sessionId));

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
            </form>

            <footer className="modal-footer">
              <Button type="button" variant="ghost" onClick={() => setIsCreateModalOpen(false)}>
                취소
              </Button>
              <Button type="submit" isLoading={isCreating} disabled={!isOperator || !sanitizePath(newPath)} className="submit-btn">
                <Play size={18} fill="currentColor" /> 세션 시작하기
              </Button>
            </footer>
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

        .new-session-modal {
          width: 100%;
          max-width: 680px;
          background: var(--surface);
          border: 1px solid var(--line);
          display: flex;
          flex-direction: column;
          padding: 0;
          overflow: hidden;
        }

        /* Header */
        .modal-header {
          padding: 1.25rem 1.5rem;
          display: flex;
          align-items: center;
          justify-content: space-between;
          border-bottom: 1px solid var(--line);
          background: linear-gradient(to bottom, #ffffff, #f9fafb);
        }

        .header-title-group {
          display: flex;
          align-items: center;
          gap: 1rem;
        }

        .header-icon-box {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          background: var(--accent-sky-bg);
          color: var(--primary);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .modal-title {
          font-size: 1.125rem;
          font-weight: 700;
          color: var(--text);
          margin: 0;
        }

        .modal-subtitle {
          font-size: 0.8125rem;
          color: var(--text-muted);
          margin: 0;
        }

        /* Body */
        .modal-body {
          padding: 1.5rem;
          display: block;
          max-height: 60vh;
          overflow-y: auto;
        }

        .form-section {
          display: block;
          margin-bottom: 1.75rem;
        }

        .section-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 0.75rem;
        }

        .section-label {
          display: block;
          font-size: 0.875rem;
          font-weight: 700;
          color: var(--text);
          text-transform: uppercase;
          letter-spacing: 0.025em;
        }

        .count-badge {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.125rem 0.5rem;
          background: var(--surface-subtle);
          border-radius: 99px;
          color: var(--text-muted);
        }

        /* Input Group */
        .input-group {
          display: flex;
          align-items: stretch;
          margin-top: 0.75rem;
        }

        .input-group :global(input) {
          margin-right: 0.5rem;
        }

        .browse-btn {
          padding: 0 1rem !important;
          flex-shrink: 0;
        }

        /* History */
        .history-stack {
          display: block;
          margin-top: 0.75rem;
        }

        .history-card {
          display: flex;
          align-items: stretch;
          background: var(--bg);
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          padding: 0.5rem;
          margin-bottom: 0.5rem;
          transition: border-color 0.2s;
        }

        .history-card:last-child {
          margin-bottom: 0;
        }

        .history-card:hover {
          border-color: var(--line-strong);
        }

        .history-info-btn {
          flex: 1;
          text-align: left;
          padding: 0.5rem 0.75rem;
          border-radius: var(--radius-sm);
          display: block;
          min-width: 0;
          transition: background 0.2s;
        }

        .history-info-btn:hover {
          background: var(--surface-soft);
        }

        .history-info-btn.selected {
          background: var(--accent-sky-bg);
          box-shadow: inset 0 0 0 1px var(--primary);
        }

        .path-text {
          display: block;
          font-size: 0.875rem;
          font-weight: 600;
          color: var(--text);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          margin-bottom: 0.25rem;
        }

        .meta-row {
          display: flex;
          align-items: center;
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .meta-item {
          display: flex;
          align-items: center;
          margin-right: 0.75rem;
        }

        .meta-item:last-child {
          margin-right: 0;
        }

        .meta-item :global(svg) {
          margin-right: 0.25rem;
        }

        .resume-btn {
          flex-shrink: 0;
          height: auto !important;
          font-size: 0.8125rem !important;
          padding: 0 0.75rem !important;
          margin-left: 0.5rem;
        }

        /* Agent Selection */
        .agent-selection-grid {
          display: block;
          margin-top: 0.75rem;
        }

        .agent-select-card {
          width: 100%;
          display: flex;
          align-items: center;
          padding: 1rem;
          border: 1px solid var(--line-strong);
          border-radius: var(--radius-md);
          background: var(--surface);
          transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
          text-align: left;
          cursor: pointer;
          margin-bottom: 0.75rem;
        }

        .agent-select-card:last-child {
          margin-bottom: 0;
        }

        .agent-select-card:hover {
          border-color: var(--primary);
          background: var(--surface-subtle);
          transform: translateY(-1px);
        }

        .agent-select-card.active {
          border-color: var(--primary);
          background: var(--accent-sky-bg);
          box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
        }

        .agent-visual {
          width: 44px;
          height: 44px;
          border-radius: 10px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          margin-right: 1rem;
        }

        .agent-details {
          display: block;
          min-width: 0;
        }

        .agent-label {
          display: block;
          font-size: 0.9375rem;
          font-weight: 700;
          color: var(--text);
          margin-bottom: 0.125rem;
        }

        .agent-desc {
          display: block;
          font-size: 0.8125rem;
          color: var(--text-muted);
          line-height: 1.4;
        }

        /* Footer */
        .modal-footer {
          padding: 1.25rem 1.5rem;
          border-top: 1px solid var(--line);
          display: flex;
          background: #fcfcfd;
        }

        .modal-footer > :first-child {
          flex: 1;
          margin-right: 1rem;
        }

        .submit-btn {
          flex: 2;
        }

        /* Responsive */
        @media (max-width: 640px) {
          .modal-content {
            margin: 0;
            border-radius: 0;
            height: 100%;
            max-height: 100%;
          }
          
          .modal-body {
            max-height: none;
            flex: 1;
          }

          .modal-footer {
            padding: 1rem;
            display: flex;
            flex-direction: column-reverse;
          }

          .modal-footer > :first-child {
            margin-right: 0;
            margin-top: 0.75rem;
          }

          .modal-footer > * {
            width: 100%;
          }
        }

        @media (min-width: 768px) {
          .desktop-create-button {
            display: inline-flex !important;
          }

          .agent-selection-grid {
            display: flex;
            margin: 0.75rem -0.375rem 0;
          }

          .agent-select-card {
            flex: 1;
            flex-direction: column;
            align-items: flex-start;
            padding: 1.25rem;
            margin: 0 0.375rem;
          }

          .agent-visual {
            margin-right: 0;
            margin-bottom: 0.75rem;
          }
        }

        .empty-state-primary-action {
          display: inline-flex;
          width: fit-content;
          margin: 2rem auto 0;
        }
      `}</style>
    </div>
  );
}
