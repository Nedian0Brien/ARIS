import Link from 'next/link';
import { TopBar } from '@/components/layout/TopBar';
import { ResponseList } from '@/components/response/ResponseList';
import { SshAccessOptions } from '@/components/workspace/SshAccessOptions';
import { WorkspaceControlPanel } from '@/components/workspace/WorkspaceControlPanel';
import { requirePageUser } from '@/lib/auth/guard';
import { getSessionEvents, listPermissionRequests } from '@/lib/happy/client';

export default async function SessionPage({
  params,
  searchParams,
}: {
  params: Promise<{ sessionId: string }>;
  searchParams: Promise<{ ssh_command?: string; ssh_expires_at?: string }>;
}) {
  const user = await requirePageUser();
  const { sessionId } = await params;
  const query = await searchParams;
  const [data, permissions] = await Promise.all([getSessionEvents(sessionId), listPermissionRequests(sessionId)]);

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main className="container">
        <div className="row" style={{ justifyContent: 'space-between', marginBottom: '0.8rem' }}>
          <div>
            <Link href="/" className="muted">
              ← Back
            </Link>
            <h1 style={{ margin: '0.5rem 0 0.2rem' }}>Session {data.session.id}</h1>
            <p className="muted" style={{ margin: 0 }}>
              {data.session.projectName} • {data.session.agent} • {data.session.status}
            </p>
          </div>
          {user.role === 'operator' ? (
            <form
              action="/api/ssh/link"
              method="post"
              style={{ display: 'grid', gap: '0.35rem', justifyItems: 'end', minWidth: '260px' }}
            >
              <input type="hidden" name="sessionId" value={data.session.id} />
              <input type="hidden" name="reason" value="ui-fallback" />
              <label className="field" style={{ marginBottom: 0, width: '100%' }}>
                <span style={{ fontSize: '0.75rem' }}>Access option</span>
                <select name="accessOption" defaultValue="guided_link">
                  <option value="guided_link">Guided link (recommended)</option>
                  <option value="direct_terminal">Direct terminal</option>
                </select>
              </label>
              <button className="secondary" type="submit">
                SSH fallback link
              </button>
              <span className="muted" style={{ fontSize: '0.75rem' }}>
                Operator only, audited.
              </span>
            </form>
          ) : null}
        </div>

        {query.ssh_command ? (
          <article className="card" style={{ marginBottom: '0.8rem', background: '#fff5e6' }}>
            <h3 style={{ marginTop: 0 }}>SSH fallback command issued</h3>
            <pre style={{ margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>{query.ssh_command}</pre>
            <p className="muted" style={{ marginBottom: 0 }}>
              Expires at: {query.ssh_expires_at ? new Date(query.ssh_expires_at).toLocaleString() : 'unknown'}
            </p>
          </article>
        ) : null}

        <WorkspaceControlPanel
          sessionId={data.session.id}
          isOperator={user.role === 'operator'}
          initialPermissions={permissions}
        />
        <SshAccessOptions />
        <ResponseList events={data.events} />
      </main>
    </div>
  );
}
