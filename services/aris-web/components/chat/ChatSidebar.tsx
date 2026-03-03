import Link from 'next/link';
import type { SessionSummary } from '@/lib/happy/types';

export function ChatSidebar({
  sessions,
  currentSessionId,
}: {
  sessions: SessionSummary[];
  currentSessionId: string;
}) {
  return (
    <aside className="chat-sidebar card" style={{ padding: '1rem' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ fontSize: '1rem', margin: 0 }}>Sessions</h2>
        <span className="chip solid" style={{ fontSize: '0.75rem' }}>{sessions.length}</span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {sessions.map((session) => {
          const isActive = session.id === currentSessionId;
          return (
            <Link
              key={session.id}
              href={`/?session=${encodeURIComponent(session.id)}`}
              style={{
                display: 'block',
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                textDecoration: 'none',
                border: `1px solid ${isActive ? '#bfdbfe' : 'var(--line)'}`,
                backgroundColor: isActive ? '#eff6ff' : 'var(--surface)',
                color: 'var(--text)',
                transition: 'all 0.2s',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.875rem', marginBottom: '0.25rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {session.projectName}
              </div>
              <div className="muted" style={{ fontSize: '0.75rem' }}>
                {session.agent} &bull; {session.status}
              </div>
            </Link>
          );
        })}
      </div>
    </aside>
  );
}
