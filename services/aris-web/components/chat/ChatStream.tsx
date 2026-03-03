import { useRef, useEffect } from 'react';
import type { UiEvent } from '@/lib/happy/types';
import { ResponseDispatcher } from '../response/ResponseDispatcher';

function parseEventActor(event: UiEvent): 'user' | 'agent' | 'system' {
  const roleRaw = event.meta?.role;
  if (roleRaw === 'user' || roleRaw === 'agent' || roleRaw === 'system') return roleRaw;
  if (event.meta?.system === true) return 'system';
  if (event.title.toLowerCase().includes('user instruction')) return 'user';
  return 'agent';
}

export function ChatStream({ events }: { events: UiEvent[] }) {
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [events]);

  return (
    <section 
      style={{ 
        display: 'flex', 
        flexDirection: 'column', 
        gap: '1.25rem', 
        paddingBottom: '2rem',
        minHeight: '50vh'
      }} 
      aria-live="polite"
    >
      {events.length === 0 ? (
        <div className="muted" style={{ textAlign: 'center', marginTop: '2rem' }}>No events yet.</div>
      ) : null}

      {events.map((event) => {
        const actor = parseEventActor(event);
        
        if (actor === 'user') {
          return (
            <article key={event.id} style={{ alignSelf: 'flex-end', maxWidth: '85%' }} className="animate-slide-up">
              <div style={{ padding: '0.75rem 1rem', backgroundColor: 'var(--text)', color: 'var(--surface)', borderRadius: 'var(--radius-lg) var(--radius-lg) 0 var(--radius-lg)', boxShadow: 'var(--shadow-sm)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center', marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.8125rem', opacity: 0.9 }}>You</span>
                  <span style={{ fontSize: '0.75rem', opacity: 0.7 }}>{new Date(event.timestamp).toLocaleTimeString()}</span>
                </div>
                <p style={{ margin: 0, fontSize: '0.875rem', whiteSpace: 'pre-wrap' }}>{event.body || '(empty)'}</p>
              </div>
            </article>
          );
        }

        if (actor === 'system') {
          return (
            <article key={event.id} style={{ alignSelf: 'center', maxWidth: '90%' }} className="animate-slide-up">
              <div style={{ padding: '0.5rem 1rem', backgroundColor: 'var(--surface-soft)', border: '1px dashed var(--line)', borderRadius: 'var(--radius-full)', color: 'var(--muted)', fontSize: '0.8125rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontWeight: 600 }}>System</span>
                <span>•</span>
                <span>{event.title}</span>
                {event.body && <span>— {event.body}</span>}
              </div>
            </article>
          );
        }

        // Agent Action
        return (
          <article key={event.id} style={{ alignSelf: 'flex-start', maxWidth: '90%', width: '100%' }} className="animate-slide-up">
             <ResponseDispatcher event={event} />
             <div className="muted" style={{ fontSize: '0.75rem', marginTop: '0.25rem', marginLeft: '0.25rem' }}>
               {new Date(event.timestamp).toLocaleTimeString()}
             </div>
          </article>
        );
      })}
      <div ref={bottomRef} />
    </section>
  );
}
