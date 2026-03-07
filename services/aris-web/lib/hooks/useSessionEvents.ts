import { useCallback, useEffect, useRef, useState } from 'react';
import type { SessionEventsPage, UiEvent } from '@/lib/happy/types';
import { redirectToLoginWithNext } from '@/lib/hooks/authRedirect';

const SAFETY_RECONCILE_INTERVAL_MS = 5000;
const EVENTS_PAGE_LIMIT = 40;

type EventsApiResponse = {
  events?: UiEvent[];
  page?: Partial<SessionEventsPage>;
};

class SessionEventsHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'SessionEventsHttpError';
    this.status = status;
  }
}

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

export function useSessionEvents(sessionId: string, initialEvents: UiEvent[], initialHasMoreBefore = false) {
  const [events, setEvents] = useState<UiEvent[]>(initialEvents);
  const [hasMoreBefore, setHasMoreBefore] = useState<boolean>(initialHasMoreBefore);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const eventsRef = useRef<UiEvent[]>(initialEvents);
  const hasMoreBeforeRef = useRef<boolean>(initialHasMoreBefore);
  const loadingOlderRef = useRef<boolean>(false);
  const terminalStatusRef = useRef<number | null>(null);

  useEffect(() => {
    setEvents(initialEvents);
    eventsRef.current = initialEvents;
    setHasMoreBefore(initialHasMoreBefore);
    hasMoreBeforeRef.current = initialHasMoreBefore;
    loadingOlderRef.current = false;
    terminalStatusRef.current = null;
    setIsLoadingOlder(false);
    setSyncError(null);
  }, [sessionId, initialEvents, initialHasMoreBefore]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    hasMoreBeforeRef.current = hasMoreBefore;
  }, [hasMoreBefore]);

  const refreshEvents = useCallback(async () => {
    if (terminalStatusRef.current === 404) {
      return;
    }

    const params = new URLSearchParams();
    params.set('limit', String(EVENTS_PAGE_LIMIT));
    const latestId = eventsRef.current[eventsRef.current.length - 1]?.id;
    if (latestId) {
      params.set('after', latestId);
    }

    const query = params.toString();
    const response = await fetch(
      `/api/runtime/sessions/${encodeURIComponent(sessionId)}/events${query ? `?${query}` : ''}`,
      { cache: 'no-store' },
    );
    if (response.status === 401) {
      redirectToLoginWithNext();
      throw new SessionEventsHttpError(401, '로그인이 만료되었습니다.');
    }
    if (response.status === 404) {
      terminalStatusRef.current = 404;
      throw new SessionEventsHttpError(404, '세션이 종료되었거나 삭제되었습니다.');
    }
    if (!response.ok) {
      throw new SessionEventsHttpError(response.status, `백엔드 이벤트 API 응답 오류 (${response.status})`);
    }

    const body = (await response.json()) as EventsApiResponse;
    if (Array.isArray(body.events)) {
      const nextEvents = body.events;
      setEvents((prev) => {
        const merged = mergeEvents([...prev, ...nextEvents]);
        return areEventsEqual(prev, merged) ? prev : merged;
      });
      if (!latestId && typeof body.page?.hasMoreBefore === 'boolean') {
        setHasMoreBefore(body.page.hasMoreBefore);
      }
      setSyncError(null);
    }
  }, [sessionId]);

  const loadOlder = useCallback(async (): Promise<{ loadedCount: number; hasMoreBefore: boolean }> => {
    if (loadingOlderRef.current || !hasMoreBeforeRef.current) {
      return { loadedCount: 0, hasMoreBefore: hasMoreBeforeRef.current };
    }

    const oldestId = eventsRef.current[0]?.id;
    if (!oldestId) {
      setHasMoreBefore(false);
      return { loadedCount: 0, hasMoreBefore: false };
    }

    loadingOlderRef.current = true;
    setIsLoadingOlder(true);

    try {
      const params = new URLSearchParams();
      params.set('before', oldestId);
      params.set('limit', String(EVENTS_PAGE_LIMIT));

      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/events?${params.toString()}`,
        { cache: 'no-store' },
      );
      if (response.status === 401) {
        redirectToLoginWithNext();
        throw new SessionEventsHttpError(401, '로그인이 만료되었습니다.');
      }
      if (response.status === 404) {
        terminalStatusRef.current = 404;
        throw new SessionEventsHttpError(404, '세션이 종료되었거나 삭제되었습니다.');
      }
      if (!response.ok) {
        throw new SessionEventsHttpError(response.status, `이전 이벤트 API 응답 오류 (${response.status})`);
      }

      const body = (await response.json()) as EventsApiResponse;
      const olderEvents = Array.isArray(body.events) ? body.events : [];
      const nextHasMoreBefore = typeof body.page?.hasMoreBefore === 'boolean'
        ? body.page.hasMoreBefore
        : olderEvents.length >= EVENTS_PAGE_LIMIT;

      setEvents((prev) => {
        const merged = mergeEvents([...olderEvents, ...prev]);
        return areEventsEqual(prev, merged) ? prev : merged;
      });
      setHasMoreBefore(nextHasMoreBefore);
      setSyncError(null);

      return { loadedCount: olderEvents.length, hasMoreBefore: nextHasMoreBefore };
    } catch (error) {
      const message = error instanceof Error ? error.message : '이전 이벤트를 불러오지 못했습니다.';
      setSyncError(message);
      throw error;
    } finally {
      loadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [sessionId]);

  useEffect(() => {
    let disposed = false;
    let eventSource: EventSource | null = null;
    let pollTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let reconcileTimer: number | null = null;

    const stopPolling = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    const startPolling = () => {
      if (terminalStatusRef.current === 404) {
        return;
      }
      if (pollTimer !== null) {
        return;
      }
      pollTimer = window.setInterval(() => {
        void refreshEvents().catch((error) => {
          if (!disposed) {
            if (error instanceof SessionEventsHttpError && error.status === 404) {
              setSyncError(error.message);
              stopPolling();
              closeStream();
              return;
            }
            setSyncError('백엔드 이벤트 동기화를 확인하세요.');
          }
        });
      }, 2000);
      void refreshEvents().catch((error) => {
        if (!disposed) {
          if (error instanceof SessionEventsHttpError && error.status === 404) {
            setSyncError(error.message);
            stopPolling();
            closeStream();
            return;
          }
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

    const startSafetyReconcile = () => {
      if (reconcileTimer !== null) {
        return;
      }
      reconcileTimer = window.setInterval(() => {
        void refreshEvents().catch((error) => {
          if (!disposed) {
            if (error instanceof SessionEventsHttpError && error.status === 404) {
              setSyncError(error.message);
              stopPolling();
              closeStream();
              return;
            }
            setSyncError('백엔드 이벤트 동기화를 확인하세요.');
          }
        });
      }, SAFETY_RECONCILE_INTERVAL_MS);
    };

    const connect = () => {
      if (disposed || terminalStatusRef.current === 404) {
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

      stream.addEventListener('stream_error', (raw) => {
        if (disposed) {
          return;
        }
        try {
          const payload = JSON.parse((raw as MessageEvent).data) as { status?: number; message?: string };
          if (payload.status === 401) {
            redirectToLoginWithNext();
            return;
          }
          if (payload.status === 404) {
            terminalStatusRef.current = 404;
            setSyncError(payload.message ?? '세션이 종료되었거나 삭제되었습니다.');
            stopPolling();
            closeStream();
            return;
          }
        } catch {
          // Fall through to the regular sync fallback.
        }
        void refreshEvents().catch((error) => {
          if (!disposed) {
            if (error instanceof SessionEventsHttpError && error.status === 404) {
              setSyncError(error.message);
              stopPolling();
              closeStream();
              return;
            }
            setSyncError('실시간 스트림 처리 중 일시 오류가 발생했습니다.');
          }
        });
      });

      stream.addEventListener('error', () => {
        if (disposed) {
          return;
        }
        if (terminalStatusRef.current === 404) {
          stopPolling();
          closeStream();
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

    startSafetyReconcile();
    connect();

    return () => {
      disposed = true;
      closeStream();
      stopPolling();
      if (reconcileTimer !== null) {
        window.clearInterval(reconcileTimer);
      }
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
      }
    };
  }, [sessionId, refreshEvents]);

  const addEvent = (event: UiEvent) => {
    setEvents((prev) => mergeEvents([...prev, event]));
  };

  return { events, addEvent, syncError, loadOlder, hasMoreBefore, isLoadingOlder };
}
