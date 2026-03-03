import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { requirePageUser } from '@/lib/auth/guard';
import { getRuntimeHealth, listSessions } from '@/lib/happy/client';

export default async function DashboardPage() {
  const user = await requirePageUser();
  const [health, sessions] = await Promise.all([getRuntimeHealth(), listSessions()]);

  const prioritizedSessions = [...sessions].sort((a, b) => b.riskScore - a.riskScore);
  const running = sessions.filter((item) => item.status === 'running').length;
  const idle = sessions.filter((item) => item.status === 'idle').length;
  const errors = sessions.filter((item) => item.status === 'error').length;

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main className="container">
        <section className="hero-panel card">
          <h1>Runtime Dashboard</h1>
          <p className="muted">
            Cross-device ARIS workspace for codex, claude-code, and gemini CLI sessions.
          </p>
        </section>

        <section className="grid">
          <article className="kpi">
            <div className="label">Total Sessions</div>
            <div className="value">{sessions.length}</div>
          </article>
          <article className="kpi">
            <div className="label">Running</div>
            <div className="value">{running}</div>
          </article>
          <article className="kpi">
            <div className="label">Errors</div>
            <div className="value">{errors}</div>
          </article>
          <article className="kpi">
            <div className="label">Idle</div>
            <div className="value">{idle}</div>
          </article>
          <article className="kpi">
            <div className="label">Runtime Health</div>
            <div className="value">{health.happy.toUpperCase()}</div>
          </article>
        </section>

        <section className="session-list">
          {prioritizedSessions.map((session) => (
            <Link key={session.id} href={`/sessions/${session.id}`} className="session-item">
              <div>
                <div style={{ fontWeight: 700 }}>{session.projectName}</div>
                <div className="muted" style={{ fontSize: '0.85rem' }}>
                  {session.agent} • risk {session.riskScore}
                </div>
              </div>
              <div className="row">
                <div className={`chip risk ${session.riskScore >= 70 ? 'high' : session.riskScore >= 35 ? 'medium' : 'low'}`}>
                  risk {session.riskScore}
                </div>
                <div className={`badge ${session.status}`}>{session.status}</div>
              </div>
            </Link>
          ))}
        </section>
      </main>
    </div>
  );
}
