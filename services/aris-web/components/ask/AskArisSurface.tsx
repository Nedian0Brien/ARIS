'use client';

import { useMemo, useState, type FormEvent } from 'react';
import {
  Activity,
  AlertCircle,
  Check,
  Clock3,
  Search,
  Send,
  Sparkles,
} from 'lucide-react';
import type { SessionChat, SessionSummary, UiEvent } from '@/lib/happy/types';
import { withAppBasePath } from '@/lib/routing/appPath';
import {
  buildProjectChatCollectionPath,
  buildProjectRuntimeEventsPath,
} from '@/lib/projectRuntimeAdapter';
import {
  ASK_ARIS_AGENT,
  ASK_ARIS_REASONING_EFFORT,
  buildAskArisChatTitle,
  buildAskArisEventPayload,
  buildAskArisSessionPayload,
  normalizeAskArisPrompt,
} from './askArisRuntime';

const SUGGESTED_ASKS = [
  'composer v2 디자인 결정 맥락 요약해줘',
  '최근 일주일 동안 가장 많이 쓴 명령어는?',
  'lawdigest 프로젝트 테스트 커버리지 현황',
  'ChatInterface의 settle 루프 이슈 해결 방식',
];

type AskRecentItem = {
  question: string;
  meta: string;
  prompt: string;
};

function displayProjectName(session: Pick<SessionSummary, 'alias' | 'projectName' | 'id'>): string {
  const candidate = session.alias || session.projectName || session.id;
  const normalized = candidate.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || candidate;
}

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return 'unknown';

  const diffMs = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

function chatActivityAt(chat: Pick<SessionChat, 'latestEventAt' | 'lastActivityAt' | 'updatedAt' | 'createdAt'>): string | null {
  return chat.latestEventAt || chat.lastActivityAt || chat.updatedAt || chat.createdAt || null;
}

function chatPromptText(chat: Pick<SessionChat, 'title' | 'latestPreview' | 'latestEventIsUser'>): string {
  const title = chat.title?.trim();
  if (title && title !== 'New chat') {
    return title;
  }
  return chat.latestPreview?.trim() || '이 채팅 맥락을 요약해줘';
}

export function buildRecentAsks(sessions: SessionSummary[]): AskRecentItem[] {
  return sessions
    .flatMap((session) => (session.recentChats ?? []).map((chat) => ({
      chat,
      sessionName: displayProjectName(session),
      timestamp: chatActivityAt(chat),
    })))
    .filter(({ chat }) => Boolean(chat.title?.trim() || chat.latestPreview?.trim()))
    .sort((a, b) => Date.parse(b.timestamp ?? '') - Date.parse(a.timestamp ?? ''))
    .slice(0, 3)
    .map(({ chat, sessionName, timestamp }) => {
      const question = chatPromptText(chat);
      return {
        question,
        meta: `${sessionName} · ${formatRelativeTime(timestamp)}`,
        prompt: question,
      };
    });
}

async function createAskRuntimeSession(rootPath: string): Promise<SessionSummary> {
  const response = await fetch(withAppBasePath('/api/runtime/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAskArisSessionPayload(rootPath)),
  });
  const body = (await response.json().catch(() => ({}))) as { session?: SessionSummary; error?: string };
  if (!response.ok || !body.session) {
    throw new Error(body.error ?? 'Ask ARIS 런타임 세션을 만들지 못했습니다.');
  }
  return body.session;
}

async function createAskRuntimeChat(projectId: string, prompt: string): Promise<SessionChat> {
  const response = await fetch(withAppBasePath(buildProjectChatCollectionPath(projectId)), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: buildAskArisChatTitle(prompt),
      agent: ASK_ARIS_AGENT,
      modelReasoningEffort: ASK_ARIS_REASONING_EFFORT,
    }),
  });
  const body = (await response.json().catch(() => ({}))) as { chat?: SessionChat; error?: string };
  if (!response.ok || !body.chat) {
    throw new Error(body.error ?? 'Ask ARIS 채팅을 만들지 못했습니다.');
  }
  return body.chat;
}

async function submitAskPrompt(projectId: string, chatId: string, prompt: string): Promise<UiEvent> {
  const response = await fetch(withAppBasePath(buildProjectRuntimeEventsPath(projectId)), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildAskArisEventPayload({
      chatId,
      prompt,
      modelReasoningEffort: ASK_ARIS_REASONING_EFFORT,
    })),
  });
  const body = (await response.json().catch(() => ({}))) as { event?: UiEvent; error?: string };
  if (!response.ok || !body.event) {
    throw new Error(body.error ?? 'Ask ARIS 질문을 전송하지 못했습니다.');
  }
  return body.event;
}

export function AskArisSurface({
  browserRootPath,
  onProjectChatOpen,
  sessions,
}: {
  browserRootPath: string;
  onProjectChatOpen: (sessionId: string, chatId: string) => void;
  sessions: SessionSummary[];
}) {
  const [query, setQuery] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const recentAsks = useMemo(() => buildRecentAsks(sessions), [sessions]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (isSubmitting) return;

    const prompt = normalizeAskArisPrompt(query);
    if (!prompt) {
      setSubmitError('질문을 입력해 주세요.');
      return;
    }
    const rootPath = browserRootPath.trim();
    if (!rootPath) {
      setSubmitError('Ask ARIS를 실행할 워크스페이스 경로가 없습니다.');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const session = await createAskRuntimeSession(rootPath);
      const chat = await createAskRuntimeChat(session.id, prompt);
      await submitAskPrompt(session.id, chat.id, prompt);
      onProjectChatOpen(session.id, chat.id);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'Ask ARIS 질문을 시작하지 못했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="m-body">
      <section className="ask" aria-labelledby="ask-title">
        <div className="ask-empty">
          <h1 id="ask-title" className="ask-title">무엇이든 물어보세요.</h1>
          <p className="ask-sub">
            프로젝트를 고르지 않아도 됩니다. 과거 채팅 전체가 컨텍스트 소스가 되고, 모델은 필요할 때 어떤 프로젝트에서 왔는지까지 인용합니다.
          </p>
          <form className="ask-search" onSubmit={handleSubmit}>
            <Search size={16} />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                if (submitError) setSubmitError(null);
              }}
              placeholder="지난 결정, 배포 맥락, 파일 변경 이유를 물어보세요."
              disabled={isSubmitting}
            />
            <button type="submit" className="comp-v2__send" disabled={isSubmitting} aria-busy={isSubmitting}>
              <Send size={13} />
              {isSubmitting ? 'Starting' : 'Ask'}
            </button>
          </form>
          {submitError && <div className="pc-chat-error" role="alert">{submitError}</div>}
          <div className="ask-eyebrow">Suggested</div>
          <div className="ask-grid">
            {SUGGESTED_ASKS.map((prompt, index) => {
              const icons = [Check, Sparkles, Activity, AlertCircle];
              const Icon = icons[index] ?? Check;
              return (
                <button key={prompt} type="button" className="ask-sug" onClick={() => setQuery(prompt)} disabled={isSubmitting}>
                  <span className="ask-sug__ico"><Icon size={12} /></span>
                  {prompt}
                </button>
              );
            })}
          </div>
        </div>
        <div className="ask-recent">
          <div className="ask-eyebrow">Recent asks</div>
          {recentAsks.length > 0 ? recentAsks.map((item) => (
            <button key={`${item.meta}-${item.question}`} type="button" className="ask-recent-item" onClick={() => setQuery(item.prompt)} disabled={isSubmitting}>
              <Clock3 size={14} />
              <span className="ask-recent-item__q">{item.question}</span>
              <span className="ask-recent-item__meta">{item.meta}</span>
            </button>
          )) : (
            <div className="ask-recent-item ask-recent-item--empty">
              <Clock3 size={14} />
              <span className="ask-recent-item__q">아직 실제 질문 기록이 없습니다.</span>
              <span className="ask-recent-item__meta">첫 질문을 보내면 여기에 표시됩니다.</span>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
