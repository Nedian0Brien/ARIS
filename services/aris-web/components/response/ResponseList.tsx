import type { UiEvent } from '@/lib/happy/types';
import { ResponseBlock } from '@/components/response/ResponseBlock';

export function ResponseList({ events }: { events: UiEvent[] }) {
  if (events.length === 0) {
    return <div className="card muted">No events yet.</div>;
  }

  return (
    <section className="response-list">
      <div className="panel-title-row">
        <h2>Session Timeline</h2>
      </div>
      {events.map((event) => (
        <ResponseBlock key={event.id} event={event} />
      ))}
    </section>
  );
}
