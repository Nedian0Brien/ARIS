import type { UiEvent } from '@/lib/happy/types';
import { TextReply } from './TextReply';
import { CommandExecution } from './CommandExecution';
import { CodeRead } from './CodeRead';
import { CodeWrite } from './CodeWrite';

export function ResponseDispatcher({ event }: { event: UiEvent }) {
  switch (event.kind) {
    case 'text_reply':
      return <TextReply event={event} />;
    case 'command_execution':
      return <CommandExecution event={event} />;
    case 'code_read':
      return <CodeRead event={event} />;
    case 'code_write':
      return <CodeWrite event={event} />;
    default:
      return (
        <div style={{ padding: '0.75rem', backgroundColor: 'var(--surface-soft)', borderRadius: 'var(--radius-md)', color: 'var(--text)', border: '1px solid var(--line)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--muted)' }}></span>
            <span style={{ fontWeight: 600, fontSize: '0.875rem', color: 'var(--muted)' }}>Unknown Action ({event.kind})</span>
          </div>
          <p style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>
            {event.body || '(empty)'}
          </p>
        </div>
      );
  }
}
