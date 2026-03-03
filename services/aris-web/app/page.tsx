import { TopBar } from '@/components/layout/TopBar';
import { ChatWorkspace } from '@/components/chat/ChatWorkspace';
import { requirePageUser } from '@/lib/auth/guard';
import { getSessionEvents, listPermissionRequests, listSessions } from '@/lib/happy/client';

export default async function WorkspacePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; ssh_command?: string; ssh_expires_at?: string }>;
}) {
  const user = await requirePageUser();
  const sessions = await listSessions();
  const query = await searchParams;

  if (sessions.length === 0) {
    return (
      <div className="app-shell">
        <TopBar user={user} />
        <main className="container">
          <article className="card">
            <h1 style={{ marginTop: 0 }}>No sessions available</h1>
            <p className="muted" style={{ marginBottom: 0 }}>
              Start an agent runtime session from backend first.
            </p>
          </article>
        </main>
      </div>
    );
  }

  const hasSelectedSession = typeof query.session === 'string' && sessions.some((item) => item.id === query.session);
  const currentSessionId = hasSelectedSession ? query.session! : sessions[0].id;
  const [detail, permissions] = await Promise.all([
    getSessionEvents(currentSessionId),
    listPermissionRequests(currentSessionId),
  ]);

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main className="container">
        <ChatWorkspace
          currentSessionId={currentSessionId}
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
}
