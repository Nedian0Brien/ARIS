import type { UiEvent } from '@/lib/happy/types';

export function CodeWrite({ event }: { event: UiEvent }) {
  const lines = event.body.split('\n').filter((line) => line.trim().length > 0);
  const path = lines[0] ?? '(change summary unavailable)';
  const diff = lines.slice(1).join('\n');

  return (
    <div style={{ padding: '0.75rem', backgroundColor: 'var(--emerald-bg)', borderRadius: 'var(--radius-md)', border: '1px solid #a7f3d0' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--emerald-fg)' }}></span>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--emerald-fg)' }}>Code Write</span>
      </div>
      
      <div style={{ 
        backgroundColor: 'rgba(255, 255, 255, 0.7)', 
        padding: '0.5rem', 
        borderRadius: 'var(--radius-sm)', 
        border: '1px solid #6ee7b7',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8125rem',
        marginBottom: '0.5rem',
        color: '#065f46'
      }}>
        {path}
      </div>

      {diff && (
        <pre style={{ 
          margin: 0, 
          padding: '0.5rem', 
          backgroundColor: '#f0fdf4', 
          color: '#1f2937', 
          borderRadius: 'var(--radius-sm)', 
          border: '1px solid #86efac',
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: '300px',
          overflow: 'auto'
        }}>
          {diff}
        </pre>
      )}
    </div>
  );
}
