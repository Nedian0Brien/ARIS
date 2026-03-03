import { TopBar } from '@/components/layout/TopBar';
import { SshAccessOptions } from '@/components/workspace/SshAccessOptions';
import { requirePageUser } from '@/lib/auth/guard';

export default async function SshFallbackPage() {
  const user = await requirePageUser();
  const canUseSsh = user.role === 'operator';

  return (
    <div className="app-shell">
      <TopBar user={user} />
      <main className="container">
        <article className="card" style={{ maxWidth: '780px' }}>
          <h1 style={{ marginTop: 0 }}>SSH Console Fallback</h1>
          {!canUseSsh ? (
            <p style={{ color: '#9b1c1c' }}>Your account role does not have SSH fallback permission.</p>
          ) : null}
          <p>
            This ARIS environment uses an audited external SSH command flow in MVP. Use the session page
            fallback button to request a scoped command.
          </p>
          <p>
            If you choose direct terminal access, ARIS cannot automatically prefill command constraints, so you
            should apply session ID and TTL rules manually.
          </p>
          <p className="muted">Role required: operator.</p>
        </article>
        <SshAccessOptions />
      </main>
    </div>
  );
}
