'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { SessionDashboard } from './SessionDashboard';
import { BottomNav, TabType } from '@/components/layout/BottomNav';
import { BackendNotice } from '@/components/ui/BackendNotice';
import { FileExplorer } from '@/components/files/FileExplorer';
import type { AuthenticatedUser } from '@/lib/auth/types';
import type { SessionSummary } from '@/lib/happy/types';

function normalizeTab(tab: string | null): TabType {
  switch (tab) {
    case 'home':
    case 'sessions':
      return 'home';
    case 'ask':
    case 'console':
      return 'ask';
    case 'project':
    case 'settings':
      return 'project';
    case 'files':
      return 'files';
    default:
      return 'home';
  }
}

function AskArisSurface({ initialSessions }: { initialSessions: SessionSummary[] }) {
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const results = (normalizedQuery
    ? initialSessions.filter((session) => {
        const haystack = [
          session.alias,
          session.projectName,
          session.status,
          session.agent,
          session.model,
          session.metadata?.runtimeModel,
        ].filter(Boolean).join(' ').toLowerCase();
        return haystack.includes(normalizedQuery);
      })
    : initialSessions
  ).slice(0, 5);

  const suggestedPrompts = [
    'composer v2 디자인 결정 맥락',
    '지난 배포에서 실패했던 원인',
    '최근 모바일 overflow 관련 수정',
  ];

  return (
    <section className="ia-surface ia-surface-ask" aria-labelledby="ask-aris-title">
      <div className="ia-surface-header">
        <h1 id="ask-aris-title">무엇이든 물어보세요.</h1>
        <p>프로젝트 없이 시작하고, 과거 채팅 전체에서 결정과 맥락을 다시 찾습니다.</p>
      </div>
      <form
        className="ia-ask-composer"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <textarea
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="지난 결정, 배포 맥락, 파일 변경 이유를 물어보세요."
          rows={4}
        />
        <button type="submit">Search</button>
      </form>
      <div className="ia-surface-grid">
        <article>
          <h2>Suggested prompts</h2>
          {suggestedPrompts.map((prompt) => (
            <button key={prompt} type="button" onClick={() => setQuery(prompt)}>
              {prompt}
            </button>
          ))}
        </article>
        <article>
          <h2>{normalizedQuery ? 'Search results' : 'Recent project context'}</h2>
          {results.length > 0 ? (
            results.map((session) => (
              <a key={session.id} href={`/sessions/${session.id}`} className="ia-recent-row">
                <span>{session.alias ?? session.projectName ?? session.id}</span>
                <span>{session.status}</span>
              </a>
            ))
          ) : (
            <p className="ia-empty-note">일치하는 프로젝트 맥락이 없습니다.</p>
          )}
        </article>
      </div>
    </section>
  );
}

function ProjectSurface({
  initialSessions,
  isOperator,
  browserRootPath,
}: {
  initialSessions: SessionSummary[];
  isOperator: boolean;
  browserRootPath: string;
}) {
  return (
    <section className="ia-project-surface" aria-label="Project">
      <div className="ia-project-heading">
        <div>
          <h1>Project</h1>
          <p>디렉토리 단위 지속 작업을 프로젝트로 보고, 채팅과 파일 맥락을 함께 관리합니다.</p>
        </div>
      </div>
      <SessionDashboard
        initialSessions={initialSessions}
        isOperator={isOperator}
        browserRootPath={browserRootPath}
      />
    </section>
  );
}

export default function HomePageWrapper({ 
  user, 
  initialSessions,
  runtimeError,
  browserRootPath,
}: { 
  user: AuthenticatedUser; 
  initialSessions: SessionSummary[];
  runtimeError: string | null;
  browserRootPath: string;
}) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('home');

  useEffect(() => {
    setActiveTab(normalizeTab(searchParams.get('tab')));
  }, [searchParams]);

  const renderContent = () => {
    switch (activeTab) {
      case 'home':
        return (
          <SessionDashboard
            initialSessions={initialSessions}
            isOperator={user.role === 'operator'}
            browserRootPath={browserRootPath}
          />
        );
      case 'ask':
        return <AskArisSurface initialSessions={initialSessions} />;
      case 'project':
        return (
          <ProjectSurface
            initialSessions={initialSessions}
            isOperator={user.role === 'operator'}
            browserRootPath={browserRootPath}
          />
        );
      case 'files':
        return <FileExplorer />;
      default:
        return null;
    }
  };

  return (
    <div className="app-shell">
      <Header 
        userEmail={user.email} 
        role={user.role} 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
      />
      <main className={`main ${activeTab === 'ask' || activeTab === 'files' ? 'console-main' : 'container'}`}>
        {runtimeError && <BackendNotice message={runtimeError} />}
        {renderContent()}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
