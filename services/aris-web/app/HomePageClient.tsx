'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { Header } from '@/components/layout/Header';
import { SessionDashboard } from './SessionDashboard';
import { BottomNav, TabType } from '@/components/layout/BottomNav';
import { BackendNotice } from '@/components/ui/BackendNotice';
import { FileExplorer } from '@/components/files/FileExplorer';
import { ConsoleTab } from './ConsoleTab';
import { SettingsTab } from './SettingsTab';
import type { AuthenticatedUser } from '@/lib/auth/types';
import type { SessionSummary } from '@/lib/happy/types';

export default function HomePageWrapper({ 
  user, 
  initialSessions,
  runtimeError
}: { 
  user: AuthenticatedUser; 
  initialSessions: SessionSummary[];
  runtimeError: string | null;
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
        return <ConsoleTab user={user} initialSessions={initialSessions} />;
      case 'files':
        return <FileExplorer />;
      case 'settings':
        return <SettingsTab />;
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
      <main className={`main ${activeTab === 'console' ? 'console-main' : 'container'}`}>
        {runtimeError && <BackendNotice message={runtimeError} />}
        {renderContent()}
      </main>
      <BottomNav activeTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
}
