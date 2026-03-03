import { useEffect, useState } from 'react';
import type { UiEvent } from '@/lib/happy/types';

function mergeEvents(events: UiEvent[]): UiEvent[] {
  const dedup = new Map<string, UiEvent>();
  for (const event of events) {
    dedup.set(event.id, event);
  }
  return [...dedup.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

export function useSessionEvents(sessionId: string, initialEvents: UiEvent[]) {
  const [events, setEvents] = useState<UiEvent[]>(initialEvents);

  useEffect(() => {
    setEvents(initialEvents);
  }, [sessionId, initialEvents]);

  useEffect(() => {
    let aborted = false;

    async function refreshEvents() {
      try {
        const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/events`, {
          cache: 'no-store',
        });
        if (!response.ok) return;

        const body = (await response.json()) as { events?: UiEvent[] };
        if (!aborted && Array.isArray(body.events)) {
          setEvents((prev) => mergeEvents([...prev, ...body.events!]));
        }
      } catch {
        // Polling failure is non-fatal
      }
    }

    refreshEvents();
    const timer = setInterval(refreshEvents, 5000);

    return () => {
      aborted = true;
      clearInterval(timer);
    };
  }, [sessionId]);

  const addEvent = (event: UiEvent) => {
    setEvents((prev) => mergeEvents([...prev, event]));
  };

  return { events, addEvent };
}
