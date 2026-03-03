import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { requirePageUser } from '@/lib/auth/guard';
import { listSessions } from '@/lib/happy/client';
import { CreateSessionForm } from '@/components/workspace/CreateSessionForm';

export default async function SessionListPage() {
  const user = await requirePageUser();
  const sessions = await listSessions();
  const isOperator = user.role === 'operator';

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main className="container" style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 400px', gap: '2rem', alignItems: 'start' }}>
        <section style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <header style={{ marginBottom: '1rem' }}>
            <h1 style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>Active Sessions</h1>
            <p className="muted" style={{ fontSize: '0.875rem' }}>Select a running agentic coding session or create a new one.</p>
          </header>

          <div style={{ display: 'grid', gap: '1rem' }}>
            {sessions.length === 0 ? (
              <article className="card animate-slide-up" style={{ textAlign: 'center', padding: '3rem' }}>
                <div style={{ fontSize: '2rem', marginBottom: '1rem' }}>🚀</div>
                <h3 style={{ marginBottom: '0.5rem' }}>No active sessions</h3>
                <p className="muted" style={{ fontSize: '0.875rem' }}>Use the form on the right to start your first agent workspace.</p>
              </article>
            ) : (
              sessions.map((session) => (
                <Link
                  key={session.id}
                  href={`/sessions/${encodeURIComponent(session.id)}`}
                  className="session-card animate-slide-up"
                >
                  <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
                    <div style={{ 
                      width: '40px', 
                      height: '40px', 
                      borderRadius: 'var(--radius-md)', 
                      backgroundColor: 'var(--surface-soft)', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontSize: '1.25rem'
                    }}>
                      {session.agent === 'claude' ? '🧠' : session.agent === 'gemini' ? '💎' : '💻'}
                    </div>
                    <div>
                      <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 600 }}>{session.projectName}</h3>
                      <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>
                        Agent: <span style={{ textTransform: 'capitalize' }}>{session.agent}</span> &bull; 
                        Activity: {session.lastActivityAt ? new Date(session.lastActivityAt).toLocaleString() : 'Never'}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <span className="chip" style={{ 
                      backgroundColor: session.status === 'running' ? 'var(--emerald-bg)' : 'var(--surface-soft)', 
                      color: session.status === 'running' ? 'var(--emerald-fg)' : 'var(--muted)',
                      textTransform: 'capitalize'
                    }}>
                      {session.status}
                    </span>
                    <span style={{ fontSize: '1rem' }}>→</span>
                  </div>
                </Link>
              ))
            )}
          </div>
        </section>

        <aside>
          <CreateSessionForm isOperator={isOperator} />
          
          <article className="card" style={{ marginTop: '1.5rem', backgroundColor: 'var(--surface-soft)', borderStyle: 'dashed' }}>
            <h3 style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>Session Guidelines</h3>
            <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.75rem', color: 'var(--muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <li>Specify the absolute path for the session runtime.</li>
              <li>Choose the appropriate agent flavor based on your task.</li>
              <li>Running sessions consume server resources; kill them when done.</li>
              <li>All actions are audited for security purposes.</li>
            </ul>
          </article>
        </aside>
      </main>
    </div>
  );
}
