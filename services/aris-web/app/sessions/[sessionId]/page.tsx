import { notFound } from 'next/navigation';
import { requirePageUser } from '@/lib/auth/guard';
import { getSessionEvents, listPermissionRequests } from '@/lib/happy/client';
import { Header } from '@/components/layout/Header';
import { ChatInterface } from './ChatInterface';

export default async function SessionPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const user = await requirePageUser();
  const { sessionId } = await params;

  try {
    const [detail, permissions] = await Promise.all([
      getSessionEvents(sessionId),
      listPermissionRequests(sessionId),
    ]);

    return (
      <div className="app-shell" style={{ height: '100vh', overflow: 'hidden' }}>
        <Header userEmail={user.email} role={user.role} />
        <main style={{ flex: 1, display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)' }}>
          <ChatInterface 
            sessionId={sessionId}
            initialEvents={detail.events}
            initialPermissions={permissions}
            isOperator={user.role === 'operator'}
            projectName={detail.session.projectName}
            agentFlavor={detail.session.agent}
          />
        </main>
      </div>
    );
  } catch (error) {
    console.error('Failed to load session:', error);
    return notFound();
  }
}
