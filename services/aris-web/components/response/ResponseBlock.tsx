import type { UiEvent } from '@/lib/happy/types';

const LABELS: Record<UiEvent['kind'], string> = {
  text_reply: 'Text Reply',
  command_execution: 'Command Execution',
  code_read: 'Code Read',
  code_write: 'Code Write',
  unknown: 'Unknown',
};

export function ResponseBlock({ event }: { event: UiEvent }) {
  const lines = event.body.split('\n').filter((line) => line.trim().length > 0);
  const first = lines[0] ?? '';
  const rest = lines.slice(1).join('\n');
  const exitCodeMatch = event.body.match(/exit code:\s*(-?\d+)/i);

  return (
    <article className={`response-block ${event.kind}`}>
      <div className="response-head">
        <div className="row">
          <span className={`kind-dot ${event.kind}`} aria-hidden="true" />
          <span className="kind-label">{LABELS[event.kind]}</span>
        </div>
        <div className="muted response-time">{new Date(event.timestamp).toLocaleString()}</div>
      </div>

      {event.kind === 'command_execution' ? (
        <div className="response-body">
          <div className="code-block">{first || '(command unavailable)'}</div>
          <pre>{rest || '(no output)'}</pre>
          <div className={`chip ${exitCodeMatch?.[1] === '0' ? 'ok' : 'warn'}`}>
            {exitCodeMatch ? `exit ${exitCodeMatch[1]}` : 'exit unknown'}
          </div>
        </div>
      ) : null}

      {event.kind === 'code_read' ? (
        <div className="response-body">
          <div className="code-path">{first || '(path unavailable)'}</div>
          <pre>{rest || event.body || '(no snippet)'}</pre>
        </div>
      ) : null}

      {event.kind === 'code_write' ? (
        <div className="response-body">
          <div className="code-path">{first || '(change summary unavailable)'}</div>
          <pre>{rest || event.body || '(no diff preview)'}</pre>
        </div>
      ) : null}

      {event.kind === 'text_reply' || event.kind === 'unknown' ? (
        <div className="response-body">
          <p>{event.body || '(empty)'}</p>
        </div>
      ) : null}
    </article>
  );
}
