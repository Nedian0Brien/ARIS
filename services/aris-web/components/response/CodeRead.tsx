import type { UiEvent } from '@/lib/happy/types';

export function CodeRead({ event }: { event: UiEvent }) {
  const lines = event.body.split('\n').filter((line) => line.trim().length > 0);
  const path = lines[0] ?? '(path unavailable)';
  const snippet = lines.slice(1).join('\n');

  return (
    <div style={{ padding: '0.75rem', backgroundColor: 'var(--violet-bg)', borderRadius: 'var(--radius-md)', border: '1px solid #ddd6fe' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--violet-fg)' }}></span>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--violet-fg)' }}>Code Read</span>
      </div>
      
      <div style={{ 
        backgroundColor: 'rgba(255, 255, 255, 0.7)', 
        padding: '0.5rem', 
        borderRadius: 'var(--radius-sm)', 
        border: '1px solid #c4b5fd',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8125rem',
        marginBottom: '0.5rem',
        color: '#5b21b6'
      }}>
        {path}
      </div>

      {snippet && (
        <pre style={{ 
          margin: 0, 
          padding: '0.5rem', 
          backgroundColor: '#faf5ff', 
          color: '#374151', 
          borderRadius: 'var(--radius-sm)', 
          border: '1px solid #e9d5ff',
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: '300px',
          overflow: 'auto'
        }}>
          {snippet}
        </pre>
      )}
    </div>
  );
}
