'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import {
  Archive,
  Check,
  ChevronRight,
  Clock3,
  Database,
  ExternalLink,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type { SessionSummary } from '@/lib/happy/types';
import { withAppBasePath } from '@/lib/routing/appPath';
import type {
  AskAnswerDraft,
  ExternalSearchResult,
  KnowledgeSearchResult,
  ProjectCandidate,
} from '@/lib/ask/knowledge';

const ASK_SUGGESTIONS = [
  '지난주 내가 결정한 주요 제품 방향을 요약해줘',
  '저번에 쓴 배포 확인 명령어를 찾아줘',
  '최근 디버깅에서 반복된 실패 원인을 정리해줘',
  '이 작업은 어느 Project chat에서 이어가면 좋을까?',
];

type AskMessageView = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  draft?: AskAnswerDraft;
};

function displayProjectName(session: SessionSummary): string {
  if (session.alias?.trim()) return session.alias.trim();
  if (session.projectName?.trim()) return session.projectName.trim().split('/').filter(Boolean).pop() ?? session.projectName;
  return session.id;
}

function buildProjectDetailPath(projectId: string): string {
  const params = new URLSearchParams();
  params.set('tab', 'project');
  params.set('project', projectId);
  params.set('view', 'chat');
  return `/?${params.toString()}`;
}

function kindLabel(kind: string): string {
  const labels: Record<string, string> = {
    decision: 'Decision',
    task_outcome: 'Outcome',
    command_recipe: 'Command',
    debug_case: 'Debug',
    deployment_record: 'Deploy',
    project_memory: 'Project',
    user_preference: 'Preference',
    external_note: 'External',
  };
  return labels[kind] ?? kind;
}

function statusLabel(status: string): string {
  if (status === 'confirmed') return 'confirmed';
  if (status === 'dismissed') return 'dismissed';
  return 'candidate';
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(withAppBasePath(path), {
    cache: 'no-store',
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof body?.error === 'string' ? body.error : 'Request failed');
  }
  return body as T;
}

export function AskArisSurface({
  sessions,
  onProjectOpen,
}: {
  sessions: SessionSummary[];
  onProjectOpen?: (sessionId: string, view?: 'chat') => void;
}) {
  const [query, setQuery] = useState('');
  const [threadId, setThreadId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AskMessageView[]>([]);
  const [assets, setAssets] = useState<KnowledgeSearchResult[]>([]);
  const [searchResults, setSearchResults] = useState<KnowledgeSearchResult[]>([]);
  const [externalResults, setExternalResults] = useState<ExternalSearchResult[]>([]);
  const [projectCandidates, setProjectCandidates] = useState<ProjectCandidate[]>([]);
  const [isLoadingAssets, setIsLoadingAssets] = useState(false);
  const [isSearching, setIsSearching] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recentProjects = useMemo(() => (
    [...sessions]
      .sort((a, b) => Date.parse(b.lastActivityAt ?? '') - Date.parse(a.lastActivityAt ?? ''))
      .slice(0, 4)
      .map((session) => ({
        projectId: session.id,
        projectName: displayProjectName(session),
        lastActivityAt: session.lastActivityAt,
      }))
  ), [sessions]);

  async function loadAssets() {
    setIsLoadingAssets(true);
    try {
      const body = await fetchJson<{ assets: KnowledgeSearchResult[] }>('/api/knowledge-assets?status=all&limit=12');
      setAssets(body.assets);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Knowledge assets를 불러오지 못했습니다.');
    } finally {
      setIsLoadingAssets(false);
    }
  }

  useEffect(() => {
    void loadAssets();
  }, []);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setSearchResults([]);
      setExternalResults([]);
      setProjectCandidates([]);
      return;
    }

    const timeout = window.setTimeout(() => {
      setIsSearching(true);
      fetchJson<{
        results: KnowledgeSearchResult[];
        externalResults: ExternalSearchResult[];
        projectCandidates: ProjectCandidate[];
      }>(`/api/ask/search?q=${encodeURIComponent(trimmed)}&limit=8`)
        .then((body) => {
          setSearchResults(body.results);
          setExternalResults(body.externalResults);
          setProjectCandidates(body.projectCandidates);
        })
        .catch((searchError) => {
          setError(searchError instanceof Error ? searchError.message : 'Ask ARIS 검색에 실패했습니다.');
        })
        .finally(() => setIsSearching(false));
    }, 220);

    return () => window.clearTimeout(timeout);
  }, [query]);

  async function ensureThread(prompt: string): Promise<string> {
    if (threadId) return threadId;
    const body = await fetchJson<{ thread: { id: string } }>('/api/ask/threads', {
      method: 'POST',
      body: JSON.stringify({ title: prompt.slice(0, 80) }),
    });
    setThreadId(body.thread.id);
    return body.thread.id;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const prompt = query.trim();
    if (!prompt || isSubmitting) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const currentThreadId = await ensureThread(prompt);
      const body = await fetchJson<{
        draft: AskAnswerDraft;
        messages: {
          userMessage: { id: string; role: 'user'; content: string; createdAt: string };
          assistantMessage: { id: string; role: 'assistant'; content: string; createdAt: string };
        };
        memories: KnowledgeSearchResult[];
        externalResults: ExternalSearchResult[];
      }>(`/api/ask/threads/${encodeURIComponent(currentThreadId)}/messages`, {
        method: 'POST',
        body: JSON.stringify({ content: prompt }),
      });

      setMessages((current) => [
        ...current,
        body.messages.userMessage,
        { ...body.messages.assistantMessage, draft: body.draft },
      ]);
      setSearchResults(body.memories);
      setExternalResults(body.externalResults);
      setProjectCandidates(body.draft.suggestedProjects);
      setQuery('');
      void loadAssets();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Ask ARIS 답변 생성에 실패했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function updateAsset(assetId: string, status: 'confirmed' | 'dismissed') {
    const body = await fetchJson<{ asset: KnowledgeSearchResult }>(`/api/knowledge-assets/${encodeURIComponent(assetId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
    setAssets((current) => current.map((asset) => (asset.id === assetId ? body.asset : asset)));
    setSearchResults((current) => current.map((asset) => (asset.id === assetId ? body.asset : asset)));
  }

  function openProject(projectId: string) {
    if (onProjectOpen) {
      onProjectOpen(projectId, 'chat');
      return;
    }
    window.location.assign(withAppBasePath(buildProjectDetailPath(projectId)));
  }

  const visibleAssets = searchResults.length > 0 ? searchResults : assets;
  const handoffProjects = projectCandidates.length > 0 ? projectCandidates : recentProjects;

  return (
    <div className="m-body">
      <section className="ask ask-layout" aria-labelledby="ask-title">
        <div className="ask-main">
          <div className="ask-empty ask-memory-hero">
            <div className="ask-kicker">
              <Database size={14} />
              ARIS memory · candidate review
            </div>
            <h1 id="ask-title" className="ask-title">Ask ARIS</h1>
            <p className="ask-sub">
              저장된 채팅, 런타임 이벤트, 결정, 명령어, 디버깅 기록을 근거로 답합니다.
              실행성 작업은 Project chat으로 이어가고, 답변 근거는 ARIS 기억 · 외부 검색 · 추론으로 분리합니다.
            </p>
            <form className="ask-search ask-search--memory" onSubmit={handleSubmit}>
              <Search size={16} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="지난 결정, 배포 맥락, 실패 원인, 명령어를 물어보세요."
              />
              <button type="submit" className="comp-v2__send" disabled={isSubmitting || !query.trim()}>
                <Send size={13} />
                {isSubmitting ? 'Asking' : 'Ask'}
              </button>
            </form>
            {error && <div className="ask-error">{error}</div>}
            <div className="ask-eyebrow">Suggested</div>
            <div className="ask-grid">
              {ASK_SUGGESTIONS.map((prompt, index) => {
                const Icon = [Sparkles, Clock3, ShieldCheck, ChevronRight][index] ?? Sparkles;
                return (
                  <button key={prompt} type="button" className="ask-sug" onClick={() => setQuery(prompt)}>
                    <span className="ask-sug__ico"><Icon size={12} /></span>
                    {prompt}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="ask-answer-stack" aria-live="polite">
            {messages.length === 0 ? (
              <div className="ask-answer-placeholder">
                <Sparkles size={16} />
                <span>질문을 보내면 ARIS 기억, 외부 검색, 추론이 분리된 답변이 여기에 쌓입니다.</span>
              </div>
            ) : messages.map((message) => (
              <article key={message.id} className={`ask-message ask-message--${message.role}`}>
                <div className="ask-message__role">{message.role === 'user' ? 'You' : 'Ask ARIS'}</div>
                {message.draft ? (
                  <div className="ask-answer-sections">
                    <section data-source-type="aris-memory">
                      <h3>ARIS 기억</h3>
                      <p>{message.draft.sections.arisMemory}</p>
                    </section>
                    <section data-source-type="external-search">
                      <h3>외부 검색</h3>
                      <p>{message.draft.sections.externalSearch}</p>
                    </section>
                    <section data-source-type="inference">
                      <h3>추론</h3>
                      <p>{message.draft.sections.inference}</p>
                    </section>
                    {message.draft.citations.length > 0 && (
                      <div className="ask-citations" aria-label="Ask ARIS citations">
                        {message.draft.citations.map((citation) => (
                          <span key={`${citation.sourceType}-${citation.sourceId}`} className="ask-citation">
                            {citation.label ?? citation.sourceType}
                            {citation.eventSeq ? ` #${citation.eventSeq}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    {message.draft.intent === 'project_handoff' && (
                      <div className="ask-handoff">
                        <div className="ask-handoff__title">Project chat으로 이어가기</div>
                        <div className="ask-handoff__projects">
                          {handoffProjects.map((project) => (
                            <button key={project.projectId} type="button" onClick={() => openProject(project.projectId)}>
                              {project.projectName}
                              <ChevronRight size={13} />
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <p>{message.content}</p>
                )}
              </article>
            ))}
          </div>
        </div>

        <aside className="ask-side" aria-label="Ask ARIS memory assets">
          <div className="ask-side__section">
            <div className="ask-side__head">
              <span>Knowledge assets</span>
              <span>{isLoadingAssets ? 'syncing' : `${visibleAssets.length} shown`}</span>
            </div>
            <div className="ask-asset-list">
              {visibleAssets.length > 0 ? visibleAssets.slice(0, 8).map((asset) => (
                <article key={asset.id} className={`ask-asset-card ask-asset-card--${asset.status}`}>
                  <div className="ask-asset-card__top">
                    <span className="ask-asset-kind">{kindLabel(asset.kind)}</span>
                    <span className="ask-asset-status">{statusLabel(asset.status)}</span>
                  </div>
                  <h3>{asset.title}</h3>
                  <p>{asset.summary}</p>
                  <div className="ask-asset-card__actions">
                    <button type="button" onClick={() => void updateAsset(asset.id, 'confirmed')} disabled={asset.status === 'confirmed'}>
                      <Check size={12} />
                      Confirm
                    </button>
                    <button type="button" onClick={() => void updateAsset(asset.id, 'dismissed')}>
                      <X size={12} />
                      Dismiss
                    </button>
                  </div>
                </article>
              )) : (
                <div className="ask-side-empty">
                  <Archive size={15} />
                  <span>{isSearching ? 'Searching ARIS memory...' : '아직 자산 후보가 없습니다.'}</span>
                </div>
              )}
            </div>
          </div>

          <div className="ask-side__section">
            <div className="ask-side__head">
              <span>External search</span>
              <span>{externalResults.length > 0 ? `${externalResults.length} sources` : 'separate'}</span>
            </div>
            <div className="ask-external-list" data-source-type="external-search">
              {externalResults.length > 0 ? externalResults.map((result) => (
                <a key={`${result.title}-${result.url ?? ''}`} href={result.url ?? '#'} className="ask-external-item" target="_blank" rel="noreferrer">
                  <ExternalLink size={12} />
                  <span>{result.title}</span>
                </a>
              )) : (
                <div className="ask-side-empty">
                  <ExternalLink size={15} />
                  <span>외부 검색은 내부 기억과 분리되어 표시됩니다.</span>
                </div>
              )}
            </div>
          </div>
        </aside>
      </section>
    </div>
  );
}
