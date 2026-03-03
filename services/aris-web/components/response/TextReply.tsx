import type { UiEvent } from '@/lib/happy/types';

export function TextReply({ event }: { event: UiEvent }) {
  return (
    <div style={{ padding: '0.75rem', backgroundColor: 'var(--sky-bg)', borderRadius: 'var(--radius-md)', color: 'var(--text)', border: '1px solid #bae6fd' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--sky-fg)' }}></span>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--sky-fg)' }}>Agent Reply</span>
      </div>
      <p style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
        {event.body || '(empty)'}
      </p>
    </div>
  );
}
