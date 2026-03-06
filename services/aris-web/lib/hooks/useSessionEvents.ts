import { useCallback, useEffect, useRef, useState } from 'react';
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
  const eventsRef = useRef<UiEvent[]>(initialEvents);

  useEffect(() => {
    setEvents(initialEvents);
    eventsRef.current = initialEvents;
    setSyncError(null);
  }, [sessionId, initialEvents]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  const refreshEvents = useCallback(async () => {
    const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/events`, {
      cache: 'no-store',
    });
    if (!response.ok) {
      throw new Error(`백엔드 이벤트 API 응답 오류 (${response.status})`);
    }

    const body = (await response.json()) as { events?: UiEvent[] };
    if (Array.isArray(body.events)) {
      const nextEvents = body.events;
      setEvents((prev) => {
        const merged = mergeEvents([...prev, ...nextEvents]);
        return areEventsEqual(prev, merged) ? prev : merged;
      });
      setSyncError(null);
    }
  }, [sessionId]);

  useEffect(() => {
    let disposed = false;
    let eventSource: EventSource | null = null;
    let pollTimer: number | null = null;
    let reconnectTimer: number | null = null;

    const stopPolling = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPolling = () => {
      if (pollTimer !== null) {
        return;
      }
      pollTimer = window.setInterval(() => {
        void refreshEvents().catch(() => {
          if (!disposed) {
            setSyncError('백엔드 이벤트 동기화를 확인하세요.');
          }
        });
      }, 2000);
      void refreshEvents().catch(() => {
        if (!disposed) {
          setSyncError('백엔드 이벤트 동기화를 확인하세요.');
        }
      });
    };

    const closeStream = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const connect = () => {
      if (disposed) {
        return;
      }

      closeStream();
      const latestId = eventsRef.current[eventsRef.current.length - 1]?.id;
      const query = latestId ? `?after=${encodeURIComponent(latestId)}` : '';
      const stream = new EventSource(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/events/stream${query}`);
      eventSource = stream;
      let opened = false;

      stream.addEventListener('open', () => {
        opened = true;
        setSyncError(null);
        stopPolling();
      });

      stream.addEventListener('event', (raw) => {
        try {
          const payload = JSON.parse((raw as MessageEvent).data) as { event?: UiEvent };
          if (!payload.event) {
            return;
          }
          setEvents((prev) => {
            const merged = mergeEvents([...prev, payload.event!]);
            return areEventsEqual(prev, merged) ? prev : merged;
          });
          setSyncError(null);
        } catch {
          // Ignore malformed stream payloads and continue receiving subsequent events.
        }
      });

      stream.addEventListener('error', () => {
        if (disposed) {
          return;
        }
        closeStream();
        if (!opened) {
          setSyncError('실시간 스트림 연결 지연으로 폴링 모드로 전환했습니다.');
        } else {
          setSyncError('실시간 스트림이 끊겨 재연결 중입니다.');
        }
        startPolling();
        if (reconnectTimer === null) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, 1500);
        }
      });
    };

    connect();

    return () => {
      disposed = true;
      closeStream();
      stopPolling();
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, [sessionId, refreshEvents]);

  const addEvent = (event: UiEvent) => {
    setEvents((prev) => mergeEvents([...prev, event]));
  };

  return { events, addEvent, syncError };
}
