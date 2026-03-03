import type { PermissionRequest, PermissionDecision } from '@/lib/happy/types';

export function PermissionStrip({
  pendingPermissions,
  onDecide,
  disabled,
}: {
  pendingPermissions: PermissionRequest[];
  onDecide: (id: string, decision: PermissionDecision) => void;
  disabled: boolean;
}) {
  if (pendingPermissions.length === 0) return null;

  return (
    <section className="card animate-slide-up" style={{ 
      borderColor: '#fcd34d', 
      backgroundColor: '#fffbeb', 
      marginBottom: '1rem',
      boxShadow: '0 4px 6px -1px rgba(251, 191, 36, 0.2)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <h2 style={{ fontSize: '1rem', margin: 0, color: '#92400e' }}>Pending Permissions</h2>
        <span className="chip" style={{ backgroundColor: '#fef3c7', color: '#b45309', border: '1px solid #fde68a' }}>
          {pendingPermissions.length}
        </span>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {pendingPermissions.map((item) => (
          <article 
            key={item.id} 
            style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '0.75rem', 
              background: '#fff', 
              padding: '0.75rem', 
              borderRadius: 'var(--radius-sm)', 
              border: '1px solid #fde68a' 
            }}
          >
            <div>
              <strong style={{ display: 'block', fontSize: '0.875rem', fontFamily: 'var(--font-mono)' }}>
                {item.command}
              </strong>
              <div className="muted" style={{ fontSize: '0.875rem', marginTop: '0.25rem' }}>
                {item.reason}
              </div>
            </div>
            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={() => onDecide(item.id, 'allow_once')}
                style={{ flex: 1, minWidth: '100px' }}
              >
                Allow Once
              </button>
              <button
                type="button"
                className="secondary"
                disabled={disabled}
                onClick={() => onDecide(item.id, 'allow_session')}
                style={{ flex: 1, minWidth: '100px' }}
              >
                Allow Session
              </button>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onDecide(item.id, 'deny')}
                style={{ flex: 1, minWidth: '100px', backgroundColor: '#fee2e2', color: '#991b1b', border: '1px solid #fecaca' }}
              >
                Deny
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
