'use client';

import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import { Play, Terminal, BrainCircuit, FolderOpen, Search, PlusCircle, X, Plus, Code, Sparkles, Clock3 } from 'lucide-react';
import { Button, Input, Card, Badge } from '@/components/ui';
import { DirectoryModal } from '@/components/ui/DirectoryModal';
import type { SessionSummary } from '@/lib/happy/types';

type AgentFlavor = 'claude' | 'codex' | 'gemini';

type PathHistoryEntry = {
  path: string;
  agent: AgentFlavor;
  lastUsedAt: string;
};

type AgentOption = {
  id: AgentFlavor;
  label: string;
  description: string;
  Icon: LucideIcon;
  accent: string;
  accentBg: string;
};

const PATH_HISTORY_STORAGE_KEY = 'aris:new-session-path-history';
const MAX_PATH_HISTORY_ITEMS = 8;
const MIN_DATE_ISO = new Date(0).toISOString();

const AGENT_OPTIONS: AgentOption[] = [
  {
    id: 'claude',
    label: 'Claude',
    description: 'Balanced planning + code edits',
    Icon: BrainCircuit,
    accent: 'var(--accent-violet)',
    accentBg: 'var(--accent-violet-bg)',
  },
  {
    id: 'codex',
    label: 'Codex',
    description: 'Fast iterative coding workflow',
    Icon: Code,
    accent: 'var(--primary)',
    accentBg: 'rgba(59, 130, 246, 0.14)',
  },
  {
    id: 'gemini',
    label: 'Gemini',
    description: 'Broad reasoning and synthesis',
    Icon: Sparkles,
    accent: 'var(--accent-emerald)',
    accentBg: 'var(--accent-emerald-bg)',
  },
];

function isAgentFlavor(value: unknown): value is AgentFlavor {
  return value === 'claude' || value === 'codex' || value === 'gemini';
}

function resolveAgent(agent: unknown): AgentFlavor {
  return isAgentFlavor(agent) ? agent : 'claude';
}

function sanitizePath(path: string): string {
  return path.trim();
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function normalizeHistoryEntry(value: unknown): PathHistoryEntry | null {
  if (typeof value === 'string') {
    const path = sanitizePath(value);
    if (!path) {
      return null;
    }

    return {
      path,
      agent: 'claude',
      lastUsedAt: MIN_DATE_ISO,
    };
  }

  const rec = asRecord(value);
  if (!rec) {
    return null;
  }

  const path = sanitizePath(typeof rec.path === 'string' ? rec.path : '');
  if (!path) {
    return null;
  }

  const rawDate = typeof rec.lastUsedAt === 'string' ? rec.lastUsedAt : MIN_DATE_ISO;
  const date = Number.isNaN(new Date(rawDate).getTime()) ? MIN_DATE_ISO : rawDate;

  return {
    path,
    agent: resolveAgent(typeof rec.agent === 'string' ? rec.agent : 'claude'),
    lastUsedAt: date,
  };
}

function readPathHistoryFromStorage(): PathHistoryEntry[] {
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
      .map((entry) => normalizeHistoryEntry(entry))
      .filter((entry): entry is PathHistoryEntry => entry !== null)
      .slice(0, MAX_PATH_HISTORY_ITEMS);
  } catch {
    return [];
  }
}

function mergePathHistory(runtimeSessions: SessionSummary[], localHistory: PathHistoryEntry[]): PathHistoryEntry[] {
  const map = new Map<string, PathHistoryEntry>();

  function upsert(entry: PathHistoryEntry) {
    const existing = map.get(entry.path);

    if (!existing || entry.lastUsedAt > existing.lastUsedAt) {
      map.set(entry.path, entry);
    }
  }

  for (const entry of localHistory) {
    upsert(entry);
  }

  for (const session of runtimeSessions) {
    const path = sanitizePath(session.projectName);
    if (!path || path === 'unknown-project') {
      continue;
    }

    const lastUsedAt = session.lastActivityAt ?? MIN_DATE_ISO;
    upsert({
      path,
      agent: resolveAgent(session.agent),
      lastUsedAt,
    });
  }

  return [...map.values()]
    .sort((a, b) => b.lastUsedAt.localeCompare(a.lastUsedAt))
    .slice(0, MAX_PATH_HISTORY_ITEMS);
}

function getAgentOption(agent: SessionSummary['agent'] | AgentFlavor): AgentOption {
  const resolved = resolveAgent(agent);
  return AGENT_OPTIONS.find((option) => option.id === resolved) ?? AGENT_OPTIONS[0];
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '최근 사용';
  }
  return date.toLocaleDateString();
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
  const [localPathHistory, setLocalPathHistory] = useState<PathHistoryEntry[]>([]);
  const router = useRouter();

  useEffect(() => {
    setMounted(true);
    setLocalPathHistory(readPathHistoryFromStorage());

    return () => setMounted(false);
  }, []);

  const pathHistory = useMemo(
    () => mergePathHistory(initialSessions, localPathHistory),
    [initialSessions, localPathHistory],
  );

  useEffect(() => {
    if (!mounted || typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PATH_HISTORY_STORAGE_KEY, JSON.stringify(pathHistory));
  }, [mounted, pathHistory]);

  function addHistory(path: string, agent: AgentFlavor) {
    const trimmedPath = sanitizePath(path);
    if (!trimmedPath) {
      return;
    }

    setLocalPathHistory((prev) => {
      const now = new Date().toISOString();
      const withoutCurrentPath = prev.filter((entry) => entry.path !== trimmedPath);
      return [{ path: trimmedPath, agent, lastUsedAt: now }, ...withoutCurrentPath].slice(0, MAX_PATH_HISTORY_ITEMS);
    });
  }

  async function startSessionWith(pathInput: string, agentInput: AgentFlavor) {
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

      const body = (await response.json().catch(() => ({}))) as { error?: string; session?: { id?: string } };

      if (!response.ok) {
        throw new Error(body.error ?? '세션 생성에 실패했습니다.');
      }

      const sessionId = body.session?.id;
      if (!sessionId) {
        throw new Error('세션 생성 응답이 올바르지 않습니다.');
      }

      addHistory(path, agentInput);
      router.push(`/sessions/${sessionId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.');
    } finally {
      setIsCreating(false);
    }
  }

  async function handleCreateSession(e: React.FormEvent) {
    e.preventDefault();
    await startSessionWith(newPath, newAgent);
  }

  function applyHistoryEntry(entry: PathHistoryEntry) {
    setNewPath(entry.path);
    setNewAgent(entry.agent);
    setError(null);
  }

  const createModal = isCreateModalOpen && mounted
    ? createPortal(
        <div className="modal-overlay" onClick={() => setIsCreateModalOpen(false)}>
          <div className="modal-content new-session-modal animate-in" onClick={(e) => e.stopPropagation()}>
            <div className="new-session-header">
              <div className="new-session-title-wrap">
                <div className="new-session-title-icon">
                  <PlusCircle size={20} />
                </div>
                <div>
                  <h3 className="title-sm">새 세션 시작</h3>
                  <p className="text-sm text-muted">최근 경로에서 바로 재개하거나 새 워크스페이스를 생성하세요.</p>
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={() => setIsCreateModalOpen(false)}
                className="new-session-close"
                style={{ padding: '0.25rem', minHeight: 'auto', borderRadius: 'var(--radius-full)' }}
              >
                <X size={20} />
              </Button>
            </div>

            <form onSubmit={handleCreateSession} className="new-session-form no-scrollbar">
              <section className="modal-section">
                <label className="text-sm modal-section-label">Project Path</label>
                <div className="path-input-row">
                  <Input
                    value={newPath}
                    onChange={(e) => setNewPath(e.target.value)}
                    placeholder="/workspace/my-app"
                    required
                    disabled={!isOperator}
                    style={{ flex: 1 }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => setIsDirModalOpen(true)}
                    disabled={!isOperator}
                    className="path-picker-btn"
                  >
                    <Search size={18} />
                  </Button>
                </div>
              </section>

              {pathHistory.length > 0 && (
                <section className="modal-section path-history-section">
                  <div className="modal-section-head">
                    <span className="text-sm modal-section-label">Recent Paths</span>
                    <span className="text-sm text-muted">{pathHistory.length}개</span>
                  </div>
                  <div className="path-history-list no-scrollbar">
                    {pathHistory.map((entry) => {
                      const option = getAgentOption(entry.agent);
                      const Icon = option.Icon;
                      const isCurrent = sanitizePath(newPath) === entry.path;

                      return (
                        <div className={`path-history-item ${isCurrent ? 'is-current' : ''}`} key={`${entry.path}-${entry.agent}`}>
                          <button
                            type="button"
                            className="path-history-select"
                            onClick={() => applyHistoryEntry(entry)}
                            disabled={!isOperator || isCreating}
                          >
                            <span className="path-history-path">{entry.path}</span>
                            <span className="path-history-meta">
                              <span className="path-history-agent" style={{ color: option.accent }}>
                                <Icon size={13} /> {option.label}
                              </span>
                              <span className="path-history-date">
                                <Clock3 size={12} /> {formatHistoryDate(entry.lastUsedAt)}
                              </span>
                            </span>
                          </button>
                          <Button
                            type="button"
                            variant="secondary"
                            onClick={() => void startSessionWith(entry.path, entry.agent)}
                            disabled={!isOperator || isCreating}
                            className="path-history-resume"
                          >
                            <Play size={13} fill="currentColor" /> 재개
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              <section className="modal-section">
                <label className="text-sm modal-section-label">Agent Flavor</label>
                <div className="agent-selector-grid" role="radiogroup" aria-label="Agent Flavor">
                  {AGENT_OPTIONS.map((option) => {
                    const Icon = option.Icon;
                    const isSelected = newAgent === option.id;

                    return (
                      <button
                        key={option.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        className={`agent-option ${isSelected ? 'is-selected' : ''}`}
                        onClick={() => setNewAgent(option.id)}
                        disabled={!isOperator || isCreating}
                      >
                        <span className="agent-logo" style={{ color: option.accent, backgroundColor: option.accentBg }}>
                          <Icon size={18} />
                        </span>
                        <span className="agent-copy">
                          <span className="agent-name">{option.label}</span>
                          <span className="agent-desc">{option.description}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              {error && <div className="text-sm new-session-error">{error}</div>}

              <div className="new-session-actions">
                <Button type="button" variant="secondary" onClick={() => setIsCreateModalOpen(false)} style={{ flex: 1 }}>
                  취소
                </Button>
                <Button
                  type="submit"
                  isLoading={isCreating}
                  disabled={!isOperator || !sanitizePath(newPath)}
                  className="new-session-submit"
                  style={{ flex: 2 }}
                >
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
            {initialSessions.map((session) => {
              const option = getAgentOption(session.agent);
              const AgentIcon = option.Icon;

              return (
                <Link key={session.id} href={`/sessions/${session.id}`}>
                  <Card style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', cursor: 'pointer', height: '100%' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ width: '48px', height: '48px', borderRadius: 'var(--radius-md)', background: option.accentBg, display: 'flex', alignItems: 'center', justifyContent: 'center', color: option.accent }}>
                        <AgentIcon size={24} />
                      </div>
                      <Badge variant={session.status === 'running' ? 'emerald' : 'amber'}>
                        {session.status}
                      </Badge>
                    </div>

                    <div style={{ flex: 1 }}>
                      <div style={{ fontWeight: 700, fontSize: '1.1rem', marginBottom: '0.25rem', wordBreak: 'break-all' }}>{session.projectName}</div>
                      <div className="text-sm text-muted">
                        {option.label} Agent
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
              );
            })}
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

        .new-session-modal {
          max-width: 680px;
          max-height: min(86vh, 760px);
          border: 1px solid rgba(148, 163, 184, 0.3);
          background:
            radial-gradient(circle at 0% 0%, rgba(14, 165, 233, 0.1), transparent 42%),
            radial-gradient(circle at 100% 0%, rgba(139, 92, 246, 0.12), transparent 48%),
            var(--surface);
        }

        .new-session-header {
          padding: 1rem 1.25rem;
          border-bottom: 1px solid var(--line);
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 1rem;
        }

        .new-session-title-wrap {
          display: flex;
          align-items: flex-start;
          gap: 0.75rem;
        }

        .new-session-title-icon {
          width: 2rem;
          height: 2rem;
          border-radius: var(--radius-md);
          background: linear-gradient(135deg, rgba(59, 130, 246, 0.18) 0%, rgba(14, 165, 233, 0.22) 100%);
          color: var(--primary);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .new-session-close {
          flex-shrink: 0;
        }

        .new-session-form {
          padding: 1.125rem;
          display: flex;
          flex-direction: column;
          gap: 0.9rem;
          overflow-y: auto;
        }

        .modal-section {
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          background: rgba(255, 255, 255, 0.76);
          padding: 0.8rem;
          display: flex;
          flex-direction: column;
          gap: 0.6rem;
        }

        .modal-section-label {
          font-weight: 700;
          letter-spacing: -0.01em;
        }

        .modal-section-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 0.5rem;
        }

        .path-input-row {
          display: flex;
          gap: 0.5rem;
        }

        .path-picker-btn {
          padding: 0 0.75rem;
        }

        .path-history-section {
          gap: 0.7rem;
        }

        .path-history-list {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          max-height: 172px;
          overflow-y: auto;
          padding-right: 0.1rem;
        }

        .path-history-item {
          border: 1px solid var(--line);
          border-radius: var(--radius-md);
          background: var(--surface);
          padding: 0.45rem;
          display: flex;
          align-items: center;
          gap: 0.5rem;
          transition: border-color 0.2s ease, box-shadow 0.2s ease;
        }

        .path-history-item.is-current {
          border-color: rgba(59, 130, 246, 0.5);
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.12);
        }

        .path-history-select {
          flex: 1;
          min-width: 0;
          text-align: left;
          display: flex;
          flex-direction: column;
          gap: 0.3rem;
          padding: 0.25rem;
          border-radius: var(--radius-sm);
          transition: background-color 0.2s ease;
        }

        .path-history-select:hover:not(:disabled) {
          background: rgba(59, 130, 246, 0.08);
        }

        .path-history-path {
          font-size: 0.875rem;
          font-weight: 600;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
          color: var(--text);
        }

        .path-history-meta {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          font-size: 0.75rem;
          color: var(--text-muted);
        }

        .path-history-agent {
          display: inline-flex;
          align-items: center;
          gap: 0.25rem;
          font-weight: 700;
        }

        .path-history-date {
          display: inline-flex;
          align-items: center;
          gap: 0.2rem;
        }

        .path-history-resume {
          min-height: 34px;
          padding: 0.35rem 0.55rem;
          font-size: 0.75rem;
          white-space: nowrap;
        }

        .agent-selector-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.55rem;
        }

        .agent-option {
          border: 1px solid var(--line-strong);
          border-radius: var(--radius-md);
          background: var(--surface);
          padding: 0.65rem;
          display: flex;
          align-items: center;
          gap: 0.7rem;
          text-align: left;
          transition: transform 0.18s ease, border-color 0.18s ease, box-shadow 0.18s ease;
        }

        .agent-option:hover:not(:disabled) {
          border-color: rgba(59, 130, 246, 0.45);
          transform: translateY(-1px);
          box-shadow: var(--shadow-sm);
        }

        .agent-option.is-selected {
          border-color: rgba(59, 130, 246, 0.65);
          box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.15);
          background: linear-gradient(180deg, rgba(248, 250, 252, 1) 0%, rgba(241, 245, 249, 0.72) 100%);
        }

        .agent-logo {
          width: 34px;
          height: 34px;
          border-radius: var(--radius-sm);
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .agent-copy {
          display: flex;
          flex-direction: column;
          min-width: 0;
        }

        .agent-name {
          font-size: 0.92rem;
          font-weight: 700;
          line-height: 1.2;
          color: var(--text);
        }

        .agent-desc {
          font-size: 0.74rem;
          color: var(--text-muted);
          line-height: 1.25;
          margin-top: 0.2rem;
        }

        .new-session-error {
          color: var(--accent-red);
          margin-top: 0.1rem;
        }

        .new-session-actions {
          display: flex;
          gap: 0.75rem;
          padding-top: 0.15rem;
        }

        .new-session-submit {
          justify-content: center;
        }

        @media (max-width: 767px) {
          .empty-state-primary-action {
            display: none;
          }

          .new-session-modal {
            max-height: 88vh;
          }

          .new-session-header {
            padding: 0.9rem 1rem;
          }

          .new-session-form {
            padding: 0.95rem;
          }

          .path-history-resume {
            padding-left: 0.5rem;
            padding-right: 0.5rem;
          }

          .new-session-actions {
            position: sticky;
            bottom: 0;
            background: linear-gradient(180deg, rgba(255, 255, 255, 0.45) 0%, rgba(255, 255, 255, 1) 35%);
            padding-bottom: 0.2rem;
          }
        }

        @media (min-width: 768px) {
          .desktop-create-button {
            display: inline-flex !important;
          }

          .empty-state-primary-action {
            display: inline-flex !important;
          }

          .new-session-header {
            padding: 1.2rem 1.35rem;
          }

          .new-session-form {
            padding: 1.25rem 1.3rem;
          }

          .agent-selector-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }

          .agent-option {
            min-height: 98px;
            flex-direction: column;
            align-items: flex-start;
            justify-content: flex-start;
            gap: 0.58rem;
          }

          .agent-copy {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
