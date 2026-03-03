import { SSH_ACCESS_OPTIONS } from '@/lib/ssh/options';

export function SshAccessOptions() {
  return (
    <article className="card ssh-options">
      <div className="panel-title-row">
        <h2>SSH Fallback Options</h2>
        <span className="chip subtle">Explain before choose</span>
      </div>
      <div className="ssh-options-grid">
        {SSH_ACCESS_OPTIONS.map((item) => (
          <section key={item.id} className={`ssh-option ${item.recommended ? 'recommended' : ''}`}>
            <div className="panel-title-row">
              <strong>{item.label}</strong>
              {item.recommended ? <span className="chip ok">Recommended</span> : null}
            </div>
            <p>{item.summary}</p>
            <p className="muted">{item.tradeoff}</p>
          </section>
        ))}
      </div>
    </article>
  );
}
