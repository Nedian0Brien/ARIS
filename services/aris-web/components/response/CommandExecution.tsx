import type { UiEvent } from '@/lib/happy/types';

export function CommandExecution({ event }: { event: UiEvent }) {
  const lines = event.body.split('\n').filter((line) => line.trim().length > 0);
  const command = lines[0] ?? '(command unavailable)';
  const output = lines.slice(1).join('\n');
  const exitCodeMatch = event.body.match(/exit code:\s*(-?\d+)/i);
  const exitCode = exitCodeMatch ? exitCodeMatch[1] : null;

  return (
    <div style={{ padding: '0.75rem', backgroundColor: 'var(--amber-bg)', borderRadius: 'var(--radius-md)', border: '1px solid #fde68a' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--amber-fg)' }}></span>
        <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--amber-fg)' }}>Command Execution</span>
      </div>
      
      <div style={{ 
        backgroundColor: 'rgba(255, 255, 255, 0.7)', 
        padding: '0.5rem', 
        borderRadius: 'var(--radius-sm)', 
        border: '1px solid #fcd34d',
        fontFamily: 'var(--font-mono)',
        fontSize: '0.8125rem',
        marginBottom: '0.5rem',
        color: '#92400e'
      }}>
        $ {command}
      </div>

      {output && (
        <pre style={{ 
          margin: 0, 
          padding: '0.5rem', 
          backgroundColor: '#111827', 
          color: '#e5e7eb', 
          borderRadius: 'var(--radius-sm)', 
          fontSize: '0.8125rem',
          fontFamily: 'var(--font-mono)',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          maxHeight: '300px',
          overflow: 'auto'
        }}>
          {output}
        </pre>
      )}

      {exitCode !== null && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '0.5rem' }}>
          <span style={{ 
            fontSize: '0.75rem', 
            padding: '0.125rem 0.375rem', 
            borderRadius: 'var(--radius-sm)',
            backgroundColor: exitCode === '0' ? '#dcfce7' : '#fee2e2',
            color: exitCode === '0' ? '#166534' : '#991b1b',
            border: `1px solid ${exitCode === '0' ? '#bbf7d0' : '#fecaca'}`
          }}>
            exit {exitCode}
          </span>
        </div>
      )}
    </div>
  );
}
