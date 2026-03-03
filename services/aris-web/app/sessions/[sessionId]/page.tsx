import { notFound } from 'next/navigation';
import { TopBar } from '@/components/layout/TopBar';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { requirePageUser } from '@/lib/auth/guard';
import { getSessionEvents, listPermissionRequests, listSessions } from '@/lib/happy/client';

export default async function SessionWorkspacePage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ ssh_command?: string; ssh_expires_at?: string }>;
}) {
  const user = await requirePageUser();
  const { sessionId } = await params;
  const sessions = await listSessions();
  
  const currentSession = sessions.find((s) => s.id === sessionId);
  if (!currentSession && sessions.length > 0) {
    // If we're using mock data and session is not found in the list, 
    // we still try to fetch events to see if it's a valid ID.
  }

  const query = await searchParams;

  try {
    const [detail, permissions] = await Promise.all([
      getSessionEvents(sessionId),
      listPermissionRequests(sessionId),
    ]);

    return (
      <div className="app-shell">
        <TopBar user={user} />
        <main className="container">
          <ChatWorkspace
            currentSessionId={sessionId}
            sessions={sessions}
            events={detail.events}
            permissions={permissions}
            isOperator={user.role === 'operator'}
            sshCommand={query.ssh_command}
            sshExpiresAt={query.ssh_expires_at}
          />
        </main>
      </div>
    );
  } catch (error) {
    console.error('Failed to load session:', error);
    return notFound();
  }
}
