import { useEffect, useState } from 'react';
import type { UiEvent } from '@/lib/happy/types';

function mergeEvents(events: UiEvent[]): UiEvent[] {
  const dedup = new Map<string, UiEvent>();
  for (const event of events) {
    dedup.set(event.id, event);
  }
  return [...dedup.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
}

function areEventsEqual(prev: UiEvent[], next: UiEvent[]): boolean {
  if (prev.length !== next.length) {
    return false;
  }

  for (let i = 0; i < prev.length; i += 1) {
    const before = prev[i];
    const after = next[i];
    if (
      before.id !== after.id ||
      before.timestamp !== after.timestamp ||
      before.kind !== after.kind ||
      before.title !== after.title ||
      before.body !== after.body ||
      before.action?.command !== after.action?.command ||
      before.action?.path !== after.action?.path ||
      before.result?.preview !== after.result?.preview ||
      before.result?.full !== after.result?.full ||
      before.result?.truncated !== after.result?.truncated
    ) {
      return false;
    }
  }

  return true;
}

export function useSessionEvents(sessionId: string, initialEvents: UiEvent[]) {
  const [events, setEvents] = useState<UiEvent[]>(initialEvents);
  const [syncError, setSyncError] = useState<string | null>(null);

  useEffect(() => {
    setEvents(initialEvents);
    setSyncError(null);
  }, [sessionId, initialEvents]);

  useEffect(() => {
    let aborted = false;

    async function refreshEvents() {
      try {
        const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/events`, {
          cache: 'no-store',
        });
        if (!response.ok) {
          setSyncError(`백엔드 이벤트 API 응답 오류 (${response.status})`);
          return;
        }

        const body = (await response.json()) as { events?: UiEvent[] };
        if (!aborted && Array.isArray(body.events)) {
          setEvents((prev) => {
            const merged = mergeEvents([...prev, ...body.events!]);
            return areEventsEqual(prev, merged) ? prev : merged;
          });
          setSyncError(null);
        }
      } catch {
        if (!aborted) {
          setSyncError('백엔드 이벤트 동기화를 확인하세요.');
        }
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

  return { events, addEvent, syncError };
}
