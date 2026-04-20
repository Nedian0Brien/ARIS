import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { SessionEventsPage, UiEvent } from '@/lib/happy/types';
import { redirectToLoginWithNext } from '@/lib/hooks/authRedirect';

const SAFETY_RECONCILE_INTERVAL_MS = 15000;
const FALLBACK_POLL_INTERVAL_MS = 4000;
const MAX_POLL_INTERVAL_MS = 30000;
const EVENTS_PAGE_LIMIT = 40;
export const MAX_LOADED_EVENT_PAGES = 3;
const STREAM_RECONNECT_DELAY_MS = 1500;
const RATE_LIMIT_RETRY_DEFAULT_MS = 10_000;
const isDocumentVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

type EventsApiResponse = {
  events?: UiEvent[];
  page?: Partial<SessionEventsPage>;
};

class SessionEventsHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'SessionEventsHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

function parseRetryAfterHeader(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const asSeconds = Number(trimmed);
  if (Number.isFinite(asSeconds) && asSeconds > 0) {
    return Math.ceil(asSeconds) * 1000;
  }
  const asDate = Date.parse(trimmed);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return null;
}

function mergeEvents(events: UiEvent[]): UiEvent[] {
  const dedup = new Map<string, UiEvent>();
  for (const event of events) {
    dedup.set(event.id, event);
  }
  return collapseRealtimeGeminiPartialEvents(
    [...dedup.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  );
}


function isGeminiPendingActionEvent(event: UiEvent): boolean {
  return event.meta?.streamEvent === 'gemini_action_pending';
}

function isGeminiFinalActionEvent(event: UiEvent): boolean {
  return event.meta?.agent === 'gemini'
    && event.meta?.streamEvent === 'agent_stream_action';
}

function isRealtimeOnlyEvent(event: UiEvent): boolean {
  const streamEvent = typeof event.meta?.streamEvent === 'string'
    ? event.meta.streamEvent.trim()
    : '';
  return (
    streamEvent === 'gemini_action_pending'
    || streamEvent === 'runtime_disconnected'
    || streamEvent === 'stream_error'
    || streamEvent === 'runtime_error'
  );
}

export function findLatestPersistedCursorEventId(events: UiEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const candidate = events[index];
    if (!candidate?.id || isRealtimeOnlyEvent(candidate)) {
      continue;
    }
    return candidate.id;
  }
  return null;
}

export function collapseRealtimeGeminiPartialEvents(events: UiEvent[]): UiEvent[] {
  const finalizedActionCallIds = new Set<string>();
  for (const event of events) {
    if (!isGeminiFinalActionEvent(event)) {
      continue;
    }
    const callId = typeof event.meta?.sessionCallId === 'string' ? event.meta.sessionCallId.trim() : '';
    if (callId) {
      finalizedActionCallIds.add(callId);
    }
  }

  return events.filter((event) => {
    if (isGeminiPendingActionEvent(event)) {
      const callId = typeof event.meta?.sessionCallId === 'string' ? event.meta.sessionCallId.trim() : '';
      if (!callId) {
        return true;
      }
      return !finalizedActionCallIds.has(callId);
    }
    return true;
  });
}

export function getScopedSessionEvents(
  events: UiEvent[],
  eventsForChatId: string | null,
  activeChatId: string | null,
): UiEvent[] {
  return eventsForChatId === activeChatId ? events : [];
}

export function appendIncomingCountToPageSizes(
  pageSizes: number[],
  incomingCount: number,
  pageLimit: number,
): number[] {
  if (incomingCount <= 0) {
    return [...pageSizes];
  }

  const nextPageSizes = [...pageSizes];
  let remaining = incomingCount;

  if (nextPageSizes.length === 0) {
    while (remaining > 0) {
      nextPageSizes.push(Math.min(pageLimit, remaining));
      remaining -= pageLimit;
    }
    return nextPageSizes;
  }

  const latestPageIndex = nextPageSizes.length - 1;
  const latestPageSize = nextPageSizes[latestPageIndex] ?? 0;
  const latestCapacity = Math.max(0, pageLimit - latestPageSize);
  if (latestCapacity > 0) {
    const fillCount = Math.min(latestCapacity, remaining);
    nextPageSizes[latestPageIndex] = latestPageSize + fillCount;
    remaining -= fillCount;
  }

  while (remaining > 0) {
    nextPageSizes.push(Math.min(pageLimit, remaining));
    remaining -= pageLimit;
  }

  return nextPageSizes;
}

export function trimEventsPageWindow(input: {
  events: UiEvent[];
  pageSizes: number[];
  maxPages: number;
  trimFrom: 'start' | 'end';
}): { events: UiEvent[]; pageSizes: number[]; trimmedCount: number } {
  const { events, maxPages, trimFrom } = input;
  const nextPageSizes = [...input.pageSizes];
  let trimmedCount = 0;

  while (nextPageSizes.length > maxPages) {
    if (trimFrom === 'start') {
      trimmedCount += nextPageSizes.shift() ?? 0;
    } else {
      trimmedCount += nextPageSizes.pop() ?? 0;
    }
  }

  if (trimmedCount <= 0) {
    return {
      events,
      pageSizes: nextPageSizes,
      trimmedCount: 0,
    };
  }

  return {
    events: trimFrom === 'start'
      ? events.slice(trimmedCount)
      : events.slice(0, Math.max(0, events.length - trimmedCount)),
    pageSizes: nextPageSizes,
    trimmedCount,
  };
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

function appendChatFilters(
  params: URLSearchParams,
  chatId: string | null,
  includeUnassigned: boolean,
) {
  if (!chatId) {
    return;
  }
  params.set('chatId', chatId);
  if (includeUnassigned) {
    params.set('includeUnassigned', '1');
  }
}

export function shouldMarkCurrentChatLoadedInitially(input: {
  initialEventsMatchChat: boolean;
  waitForInitialClientSync: boolean;
}): boolean {
  if (!input.initialEventsMatchChat) {
    return false;
  }
  return !input.waitForInitialClientSync;
}

export function shouldForceInitialRefreshOnMount(input: {
  enabled: boolean;
  existingEventCount: number;
  waitForInitialClientSync: boolean;
}): boolean {
  if (input.enabled) {
    return true;
  }
  if (input.existingEventCount === 0) {
    return true;
  }
  return input.waitForInitialClientSync;
}

export function useSessionEvents(
  sessionId: string,
  chatId: string | null,
  includeUnassigned: boolean,
  initialEvents: UiEvent[],
  initialHasMoreBefore = false,
  initialEventsChatId: string | null = chatId,
  enabled = true,
  waitForInitialClientSync = false,
) {
  const initialEventsMatchChat = initialEventsChatId === chatId;
  const hydratedInitialEvents = useMemo(
    () => (initialEventsMatchChat ? initialEvents : []),
    [initialEventsMatchChat, initialEvents],
  );
  const hydratedInitialHasMoreBefore = initialEventsMatchChat ? initialHasMoreBefore : false;
  const [events, setEvents] = useState<UiEvent[]>(hydratedInitialEvents);
  // Tracks which chatId the current `events` state belongs to.
  // Used by callers to avoid consuming stale events from a previously active chat
  // during the render cycle before the state reset effect fires.
  const [eventsForChatId, setEventsForChatId] = useState<string | null>(
    initialEventsMatchChat ? chatId : null,
  );
  const [hasMoreBefore, setHasMoreBefore] = useState<boolean>(hydratedInitialHasMoreBefore);
  const [isLoadingOlder, setIsLoadingOlder] = useState(false);
  const [isResettingToLatest, setIsResettingToLatest] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [hasLoadedCurrentChat, setHasLoadedCurrentChat] = useState(
    shouldMarkCurrentChatLoadedInitially({
      initialEventsMatchChat,
      waitForInitialClientSync,
    }),
  );
  const eventsRef = useRef<UiEvent[]>(hydratedInitialEvents);
  const hasMoreBeforeRef = useRef<boolean>(hydratedInitialHasMoreBefore);
  const loadingOlderRef = useRef<boolean>(false);
  const terminalStatusRef = useRef<number | null>(null);
  const pageSizesRef = useRef<number[]>(hydratedInitialEvents.length > 0 ? [hydratedInitialEvents.length] : []);
  const pollBackoffMsRef = useRef<number>(FALLBACK_POLL_INTERVAL_MS);
  const rateLimitUntilMsRef = useRef<number | null>(null);
  const resetToLatestPromiseRef = useRef<Promise<void> | null>(null);
  const hasCompletedInitialClientSyncRef = useRef(
    shouldMarkCurrentChatLoadedInitially({
      initialEventsMatchChat,
      waitForInitialClientSync,
    }),
  );
  // 비동기 콜백(refreshEvents, SSE handler)에서 현재 활성 chatId를 동기적으로 확인하기 위한 ref.
  // 채팅 전환 후 이전 chatId의 in-flight fetch가 완료되어도 상태가 오염되지 않도록 guard 역할.
  const activeChatIdRef = useRef<string | null>(chatId);

  activeChatIdRef.current = chatId;

  useEffect(() => {
    setEvents(hydratedInitialEvents);
    setEventsForChatId(chatId);
    eventsRef.current = hydratedInitialEvents;
    setHasMoreBefore(hydratedInitialHasMoreBefore);
    hasMoreBeforeRef.current = hydratedInitialHasMoreBefore;
    pageSizesRef.current = hydratedInitialEvents.length > 0 ? [hydratedInitialEvents.length] : [];
    loadingOlderRef.current = false;
    terminalStatusRef.current = null;
    setIsLoadingOlder(false);
    setIsResettingToLatest(false);
    resetToLatestPromiseRef.current = null;
    setSyncError(null);
    const initiallyLoaded = shouldMarkCurrentChatLoadedInitially({
      initialEventsMatchChat,
      waitForInitialClientSync,
    });
    hasCompletedInitialClientSyncRef.current = initiallyLoaded;
    setHasLoadedCurrentChat(initiallyLoaded);
  }, [
    sessionId,
    chatId,
    includeUnassigned,
    hydratedInitialEvents,
    hydratedInitialHasMoreBefore,
    initialEventsMatchChat,
    initialEventsChatId,
    waitForInitialClientSync,
  ]);

  useEffect(() => {
    eventsRef.current = events;
  }, [events]);

  useEffect(() => {
    hasMoreBeforeRef.current = hasMoreBefore;
  }, [hasMoreBefore]);

  const scopedEvents = useMemo(
    () => getScopedSessionEvents(events, eventsForChatId, chatId),
    [chatId, events, eventsForChatId],
  );
  const scopedHasMoreBefore = eventsForChatId === chatId ? hasMoreBefore : false;
  const scopedIsLoadingOlder = eventsForChatId === chatId ? isLoadingOlder : false;

  const appendIncomingEvents = useCallback((incomingEvents: UiEvent[]) => {
    if (incomingEvents.length === 0) {
      return { appendedCount: 0, trimmedCount: 0 };
    }

    const currentEvents = eventsRef.current;
    const existingIds = new Set(currentEvents.map((event) => event.id));
    const uniqueIncomingEvents = incomingEvents.filter((event) => !existingIds.has(event.id));
    if (uniqueIncomingEvents.length === 0) {
      return { appendedCount: 0, trimmedCount: 0 };
    }

    const mergedEvents = mergeEvents([...currentEvents, ...uniqueIncomingEvents]);
    const nextPageSizes = appendIncomingCountToPageSizes(
      pageSizesRef.current,
      uniqueIncomingEvents.length,
      EVENTS_PAGE_LIMIT,
    );
    const trimmed = trimEventsPageWindow({
      events: mergedEvents,
      pageSizes: nextPageSizes,
      maxPages: MAX_LOADED_EVENT_PAGES,
      trimFrom: 'start',
    });

    eventsRef.current = trimmed.events;
    pageSizesRef.current = trimmed.pageSizes;
    setEventsForChatId(chatId);
    setEvents((prev) => (areEventsEqual(prev, trimmed.events) ? prev : trimmed.events));

    return {
      appendedCount: uniqueIncomingEvents.length,
      trimmedCount: trimmed.trimmedCount,
    };
  }, [chatId]);

  const refreshEvents = useCallback(async (force = false) => {
    if (!enabled && !force) {
      return;
    }
    if (terminalStatusRef.current === 404 || !isDocumentVisible()) {
      return;
    }

    // fetch를 시작할 때의 chatId를 캡처하여, 응답 수신 후 chatId가 변경되었는지 검증.
    const snapshotChatId = chatId;

    const params = new URLSearchParams();
    params.set('limit', String(EVENTS_PAGE_LIMIT));
    appendChatFilters(params, chatId, includeUnassigned);
    const latestId = findLatestPersistedCursorEventId(eventsRef.current);
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
      throw new SessionEventsHttpError(404, '워크스페이스가 종료되었거나 삭제되었습니다.');
    }
    if (!response.ok) {
      const retryAfterMs = response.status === 429
        ? parseRetryAfterHeader(response.headers.get('Retry-After'))
        : null;
      throw new SessionEventsHttpError(
        response.status,
        `백엔드 이벤트 API 응답 오류 (${response.status})`,
        retryAfterMs,
      );
    }

    // 채팅이 전환되었으면 이 응답은 현재 활성 채팅의 것이 아니므로 무시.
    if (activeChatIdRef.current !== snapshotChatId) {
      return;
    }

    const body = (await response.json()) as EventsApiResponse;
    if (Array.isArray(body.events)) {
      // 응답 파싱 후에도 한 번 더 검증 (파싱 사이에 전환될 수 있으므로).
      if (activeChatIdRef.current !== snapshotChatId) {
        return;
      }
      const nextEvents = body.events;
      const { appendedCount, trimmedCount } = appendIncomingEvents(nextEvents);
      if (!latestId && typeof body.page?.hasMoreBefore === 'boolean') {
        setHasMoreBefore(body.page.hasMoreBefore);
      } else if (trimmedCount > 0) {
        setHasMoreBefore(true);
      }
      pollBackoffMsRef.current = FALLBACK_POLL_INTERVAL_MS;
      rateLimitUntilMsRef.current = null;
      setSyncError(null);
      if (!hasCompletedInitialClientSyncRef.current || appendedCount > 0 || nextEvents.length === 0) {
        hasCompletedInitialClientSyncRef.current = true;
        setHasLoadedCurrentChat(true);
      }
    }
  }, [appendIncomingEvents, enabled, sessionId, chatId, includeUnassigned]);

  const loadOlder = useCallback(async (): Promise<{ loadedCount: number; hasMoreBefore: boolean }> => {
    if (loadingOlderRef.current || !hasMoreBeforeRef.current) {
      return { loadedCount: 0, hasMoreBefore: hasMoreBeforeRef.current };
    }

    const oldestId = eventsRef.current[0]?.id;
    if (!oldestId) {
      setHasMoreBefore(false);
      return { loadedCount: 0, hasMoreBefore: false };
    }

    const snapshotChatId = chatId;
    loadingOlderRef.current = true;
    setIsLoadingOlder(true);

    try {
      const params = new URLSearchParams();
      params.set('before', oldestId);
      params.set('limit', String(EVENTS_PAGE_LIMIT));
      appendChatFilters(params, chatId, includeUnassigned);

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
        throw new SessionEventsHttpError(404, '워크스페이스가 종료되었거나 삭제되었습니다.');
      }
      if (!response.ok) {
        const retryAfterMs = response.status === 429
          ? parseRetryAfterHeader(response.headers.get('Retry-After'))
          : null;
        throw new SessionEventsHttpError(response.status, `이전 이벤트 API 응답 오류 (${response.status})`, retryAfterMs);
      }

      if (activeChatIdRef.current !== snapshotChatId) {
        return { loadedCount: 0, hasMoreBefore: hasMoreBeforeRef.current };
      }

      const body = (await response.json()) as EventsApiResponse;
      const olderEvents = Array.isArray(body.events) ? body.events : [];
      const nextHasMoreBefore = typeof body.page?.hasMoreBefore === 'boolean'
        ? body.page.hasMoreBefore
        : olderEvents.length >= EVENTS_PAGE_LIMIT;

      if (activeChatIdRef.current !== snapshotChatId) {
        return { loadedCount: 0, hasMoreBefore: hasMoreBeforeRef.current };
      }

      const currentEvents = eventsRef.current;
      const existingIds = new Set(currentEvents.map((event) => event.id));
      const uniqueOlderEvents = olderEvents.filter((event) => !existingIds.has(event.id));
      const mergedEvents = mergeEvents([...uniqueOlderEvents, ...currentEvents]);
      const nextPageSizes = uniqueOlderEvents.length > 0
        ? [uniqueOlderEvents.length, ...pageSizesRef.current]
        : [...pageSizesRef.current];
      const trimmed = trimEventsPageWindow({
        events: mergedEvents,
        pageSizes: nextPageSizes,
        maxPages: MAX_LOADED_EVENT_PAGES,
        trimFrom: 'end',
      });

      eventsRef.current = trimmed.events;
      pageSizesRef.current = trimmed.pageSizes;
      setEventsForChatId(chatId);
      setEvents((prev) => (areEventsEqual(prev, trimmed.events) ? prev : trimmed.events));
      setHasMoreBefore(nextHasMoreBefore);
      pollBackoffMsRef.current = FALLBACK_POLL_INTERVAL_MS;
      rateLimitUntilMsRef.current = null;
      setSyncError(null);

      return { loadedCount: olderEvents.length, hasMoreBefore: nextHasMoreBefore };
    } catch (error) {
      if (error instanceof SessionEventsHttpError && error.status === 429) {
        const retryAfterMs = error.retryAfterMs ?? RATE_LIMIT_RETRY_DEFAULT_MS;
        const nextRetryAt = Date.now() + Math.max(retryAfterMs, FALLBACK_POLL_INTERVAL_MS);
        rateLimitUntilMsRef.current = Math.max(rateLimitUntilMsRef.current ?? 0, nextRetryAt);
        pollBackoffMsRef.current = Math.max(FALLBACK_POLL_INTERVAL_MS, retryAfterMs);
        setSyncError(null);
      } else {
        const message = error instanceof Error ? error.message : '이전 이벤트를 불러오지 못했습니다.';
        setSyncError(message);
      }
      throw error;
    } finally {
      loadingOlderRef.current = false;
      setIsLoadingOlder(false);
    }
  }, [sessionId, chatId, includeUnassigned]);

  const resetToLatestWindow = useCallback(async () => {
    if (!chatId) {
      return;
    }
    if (resetToLatestPromiseRef.current) {
      return resetToLatestPromiseRef.current;
    }

    const snapshotChatId = chatId;
    const promise = (async () => {
      setIsResettingToLatest(true);
      try {
        const params = new URLSearchParams();
        params.set('limit', String(EVENTS_PAGE_LIMIT));
        appendChatFilters(params, chatId, includeUnassigned);

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
          throw new SessionEventsHttpError(404, '워크스페이스가 종료되었거나 삭제되었습니다.');
        }
        if (!response.ok) {
          throw new SessionEventsHttpError(response.status, `최신 이벤트 API 응답 오류 (${response.status})`);
        }

        if (activeChatIdRef.current !== snapshotChatId) {
          return;
        }

        const body = (await response.json()) as EventsApiResponse;
        const nextEvents = Array.isArray(body.events) ? mergeEvents(body.events) : [];

        if (activeChatIdRef.current !== snapshotChatId) {
          return;
        }

        eventsRef.current = nextEvents;
        pageSizesRef.current = nextEvents.length > 0 ? [nextEvents.length] : [];
        setEventsForChatId(chatId);
        setEvents((prev) => (areEventsEqual(prev, nextEvents) ? prev : nextEvents));
        setHasMoreBefore(typeof body.page?.hasMoreBefore === 'boolean' ? body.page.hasMoreBefore : false);
        setSyncError(null);
        if (!hasCompletedInitialClientSyncRef.current) {
          hasCompletedInitialClientSyncRef.current = true;
          setHasLoadedCurrentChat(true);
        }
      } finally {
        resetToLatestPromiseRef.current = null;
        setIsResettingToLatest(false);
      }
    })();

    resetToLatestPromiseRef.current = promise;
    return promise;
  }, [chatId, includeUnassigned, sessionId]);

  useEffect(() => {
    let disposed = false;
    let eventSource: EventSource | null = null;
    let pollTimer: number | null = null;
    let pollDelayTimer: number | null = null;
    let reconnectTimer: number | null = null;
    let reconcileTimer: number | null = null;

    const stopPolling = () => {
      if (pollTimer !== null) {
        window.clearInterval(pollTimer);
        pollTimer = null;
      }
      if (pollDelayTimer !== null) {
        window.clearTimeout(pollDelayTimer);
        pollDelayTimer = null;
      }
    };

    const getRateLimitRemainingMs = () => {
      if (rateLimitUntilMsRef.current === null) {
        return 0;
      }
      return Math.max(0, rateLimitUntilMsRef.current - Date.now());
    };

    const applyRateLimit = (retryAfterMs: number | null) => {
      const retryMs = Math.max(retryAfterMs ?? RATE_LIMIT_RETRY_DEFAULT_MS, FALLBACK_POLL_INTERVAL_MS);
      const nextRetryAt = Date.now() + retryMs;
      rateLimitUntilMsRef.current = Math.max(rateLimitUntilMsRef.current ?? 0, nextRetryAt);
      pollBackoffMsRef.current = Math.min(
        Math.max(pollBackoffMsRef.current, retryMs),
        MAX_POLL_INTERVAL_MS,
      );
    };

    const getPollIntervalMs = () => {
      const rateLimitMs = getRateLimitRemainingMs();
      return Math.max(
        FALLBACK_POLL_INTERVAL_MS,
        pollBackoffMsRef.current,
        rateLimitMs,
      );
    };

    const nextReconnectDelayMs = () => {
      return Math.max(STREAM_RECONNECT_DELAY_MS, getRateLimitRemainingMs());
    };

    const handleRefreshError = (error: unknown, fallbackMessage: string) => {
      if (disposed) {
        return;
      }

      if (error instanceof SessionEventsHttpError && error.status === 404) {
        setSyncError(error.message);
        stopPolling();
        closeStream();
        return;
      }

      if (error instanceof SessionEventsHttpError && error.status === 429) {
        stopPolling();
        applyRateLimit(error.retryAfterMs);
        startPolling();
        setSyncError(null);
        return;
      }

      pollBackoffMsRef.current = Math.min(
        Math.max(pollBackoffMsRef.current * 2, FALLBACK_POLL_INTERVAL_MS * 2),
        MAX_POLL_INTERVAL_MS,
      );
      stopPolling();
      startPolling();
      setSyncError(fallbackMessage);
    };

    const runRefresh = () => {
      void refreshEvents().catch((error) => {
        handleRefreshError(error, '백엔드 이벤트 동기화를 확인하세요.');
      });
    };

    const startPolling = () => {
      if (!enabled) {
        return;
      }
      if (terminalStatusRef.current === 404) {
        return;
      }
      if (!isDocumentVisible()) {
        return;
      }
      if (getRateLimitRemainingMs() > 0) {
        if (reconnectTimer === null) {
          reconnectTimer = window.setTimeout(() => {
            reconnectTimer = null;
            connect();
          }, nextReconnectDelayMs());
        }
        return;
      }
      if (pollTimer !== null || pollDelayTimer !== null) {
        return;
      }
      const pollIntervalMs = getPollIntervalMs();
      pollDelayTimer = window.setTimeout(() => {
        pollDelayTimer = null;
        runRefresh();
        pollTimer = window.setInterval(runRefresh, pollIntervalMs);
      }, pollIntervalMs);
    };

    const closeStream = () => {
      if (eventSource) {
        eventSource.close();
        eventSource = null;
      }
    };

    const startSafetyReconcile = () => {
      if (!enabled) {
        return;
      }
      if (reconcileTimer !== null) {
        return;
      }
      reconcileTimer = window.setInterval(() => {
        void refreshEvents().catch((error) => {
          handleRefreshError(error, '백엔드 이벤트 동기화를 확인하세요.');
        });
      }, SAFETY_RECONCILE_INTERVAL_MS);
    };

    const connect = () => {
      if (disposed || terminalStatusRef.current === 404) {
        return;
      }
      if (!isDocumentVisible()) {
        return;
      }

      closeStream();
      const latestId = findLatestPersistedCursorEventId(eventsRef.current);
      const streamChatId = chatId;
      const params = new URLSearchParams();
      appendChatFilters(params, chatId, includeUnassigned);
      if (latestId) {
        params.set('after', latestId);
      }
      const query = params.toString();
      const stream = new EventSource(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/events/stream${query ? `?${query}` : ''}`,
      );
      eventSource = stream;
      let opened = false;

      stream.addEventListener('open', () => {
        opened = true;
        setSyncError(null);
        stopPolling();
      });

      stream.addEventListener('event', (raw) => {
        // 채팅 전환 후 이전 SSE 연결에서 도착하는 이벤트를 무시.
        if (activeChatIdRef.current !== streamChatId) {
          return;
        }
        try {
          const payload = JSON.parse((raw as MessageEvent).data) as { event?: UiEvent };
          if (!payload.event) {
            return;
          }
          const { trimmedCount } = appendIncomingEvents([payload.event!]);
          if (trimmedCount > 0) {
            setHasMoreBefore(true);
          }
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
          const payload = JSON.parse((raw as MessageEvent).data) as {
            status?: number;
            message?: string;
            retryAfterMs?: number;
          };
          if (payload.status === 401 || payload.status === 403) {
            redirectToLoginWithNext();
            return;
          }
          if (payload.status === 404) {
            terminalStatusRef.current = 404;
            setSyncError(payload.message ?? '워크스페이스가 종료되었거나 삭제되었습니다.');
            stopPolling();
            closeStream();
            return;
          }
          if (payload.status === 429) {
            applyRateLimit(payload.retryAfterMs ?? null);
            closeStream();
            startPolling();
            if (reconnectTimer === null) {
              reconnectTimer = window.setTimeout(() => {
                reconnectTimer = null;
                connect();
              }, nextReconnectDelayMs());
            }
            return;
          }
        } catch {
          // Fall through to the regular sync fallback.
        }
        void refreshEvents().catch((error) => {
          handleRefreshError(error, '실시간 스트림 처리 중 일시 오류가 발생했습니다.');
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
          }, nextReconnectDelayMs());
        }
      });
    };

    startSafetyReconcile();
    if (isDocumentVisible()) {
      connect();
    }

    const pauseRealtime = () => {
      stopPolling();
      closeStream();
      if (reconnectTimer !== null) {
        window.clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      if (reconcileTimer !== null) {
        window.clearInterval(reconcileTimer);
        reconcileTimer = null;
      }
    };

    const resumeRealtime = () => {
      if (disposed || terminalStatusRef.current === 404 || !isDocumentVisible()) {
        return;
      }
      startSafetyReconcile();
      connect();
      void refreshEvents(!enabled).catch((error) => {
        handleRefreshError(error, '백엔드 이벤트 동기화를 확인하세요.');
      });
    };

    const handleVisibilityChange = () => {
      if (isDocumentVisible()) {
        resumeRealtime();
      } else {
        pauseRealtime();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', resumeRealtime);

    // Fetch initial data immediately if there is no client-side baseline
    // (e.g. when changing chats dynamically before server components re-render)
    void refreshEvents(shouldForceInitialRefreshOnMount({
      enabled,
      existingEventCount: eventsRef.current.length,
      waitForInitialClientSync,
    })).catch((error) => {
      handleRefreshError(error, '백엔드 이벤트 동기화를 확인하세요.');
    });

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
      if (pollDelayTimer !== null) {
        window.clearTimeout(pollDelayTimer);
      }
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', resumeRealtime);
    };
  }, [appendIncomingEvents, enabled, sessionId, chatId, includeUnassigned, refreshEvents, waitForInitialClientSync]);

  const addEvent = (event: UiEvent) => {
    const { trimmedCount } = appendIncomingEvents([event]);
    if (trimmedCount > 0) {
      setHasMoreBefore(true);
    }
  };

  return {
    events: scopedEvents,
    eventsForChatId,
    addEvent,
    syncError,
    loadOlder,
    hasMoreBefore: scopedHasMoreBefore,
    isLoadingOlder: scopedIsLoadingOlder,
    hasLoadedCurrentChat,
    resetToLatestWindow,
    isResettingToLatest,
  };
}
