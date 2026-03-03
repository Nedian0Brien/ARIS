import { SSH_ACCESS_OPTIONS } from '@/lib/ssh/options';

export function SshAccessOptions() {
  return (
    <article className="card" style={{ maxWidth: '780px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h2 style={{ margin: 0, fontSize: '1.25rem' }}>SSH Fallback Options</h2>
        <span className="chip" style={{ backgroundColor: 'var(--surface-soft)', border: '1px solid var(--line)', color: 'var(--muted)' }}>
          Explain before choose
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1rem' }}>
        {SSH_ACCESS_OPTIONS.map((item) => (
          <section 
            key={item.id} 
            style={{ 
              padding: '1rem', 
              borderRadius: 'var(--radius-md)', 
              border: item.recommended ? '1px solid #93c5fd' : '1px solid var(--line)',
              backgroundColor: item.recommended ? '#eff6ff' : 'var(--surface)',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
              <strong style={{ fontSize: '1rem' }}>{item.label}</strong>
              {item.recommended ? (
                <span className="chip" style={{ backgroundColor: 'var(--emerald-bg)', color: 'var(--emerald-fg)' }}>
                  Recommended
                </span>
              ) : null}
            </div>
            <p style={{ fontSize: '0.875rem', marginBottom: '0.5rem' }}>{item.summary}</p>
            <p className="muted" style={{ fontSize: '0.8125rem', margin: 0 }}>{item.tradeoff}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
