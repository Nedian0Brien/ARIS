'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { SessionDashboard } from './SessionDashboard';
import { BottomNav, TabType } from '@/components/layout/BottomNav';
import { Card } from '@/components/ui';
import { Construction } from 'lucide-react';
import type { AuthenticatedUser } from '@/lib/auth/types';
import type { SessionSummary } from '@/lib/happy/types';

export default function HomePageWrapper({ 
  user, 
  initialSessions 
}: { 
  user: AuthenticatedUser; 
  initialSessions: SessionSummary[];
}) {
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabType>('sessions');

  useEffect(() => {
    const tab = searchParams.get('tab') as TabType;
    if (tab && ['sessions', 'console', 'files', 'settings'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  const renderContent = () => {
    switch (activeTab) {
      case 'sessions':
        return <SessionDashboard initialSessions={initialSessions} isOperator={user.role === 'operator'} />;
      case 'console':
        return (
          <div className="animate-in" style={{ padding: '2rem 0' }}>
            <Card style={{ padding: '4rem 2rem', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', color: 'var(--accent-amber)' }}>
                <Construction size={64} strokeWidth={1.5} />
              </div>
              <h2 className="title-md">콘솔 (Console) - 준비 중</h2>
              <p className="text-muted" style={{ marginTop: '1rem', maxWidth: '500px', margin: '1rem auto', fontSize: '0.875rem' }}>
                에이전트가 실행 중인 런타임의 실시간 로그를 확인하고 직접 명령어를 입력할 수 있는 터미널 인터페이스입니다.
              </p>
            </Card>
          </div>
        );
      case 'files':
        return (
          <div className="animate-in" style={{ padding: '2rem 0' }}>
            <Card style={{ padding: '4rem 2rem', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', color: 'var(--accent-sky)' }}>
                <Construction size={64} strokeWidth={1.5} />
              </div>
              <h2 className="title-md">파일 (Files) - 준비 중</h2>
              <p className="text-muted" style={{ marginTop: '1rem', maxWidth: '500px', margin: '1rem auto', fontSize: '0.875rem' }}>
                워크스페이스 내의 파일 구조를 탐색하고 에이전트가 수정한 내용을 시각적으로 비교 및 관리할 수 있는 파일 익스플로러입니다.
              </p>
            </Card>
          </div>
        );
      case 'settings':
        return (
          <div className="animate-in" style={{ padding: '2rem 0' }}>
            <Card style={{ padding: '4rem 2rem', textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem', color: 'var(--accent-violet)' }}>
                <Construction size={64} strokeWidth={1.5} />
              </div>
              <h2 className="title-md">설정 (Settings) - 준비 중</h2>
              <p className="text-muted" style={{ marginTop: '1rem', maxWidth: '500px', margin: '1rem auto', fontSize: '0.875rem' }}>
                API 키 관리, 테마 설정, 2FA 설정 및 기기 인증 관리 등 ARIS 워크스페이스의 전반적인 환경을 설정할 수 있습니다.
              </p>
            </Card>
          </div>
        );
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
      <main className="main container">
        {renderContent()}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
