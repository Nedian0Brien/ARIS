import type { SessionEventsPage, UiEvent } from '@/lib/happy/types';

export const MAX_LOADED_EVENT_PAGES = 3;
export const STREAM_RECONNECT_DELAY_MS = 1500;
export const RATE_LIMIT_RETRY_DEFAULT_MS = 10_000;
export const isDocumentVisible = () => typeof document === 'undefined' || document.visibilityState === 'visible';

export type EventsApiResponse = {
  events?: UiEvent[];
  page?: Partial<SessionEventsPage>;
};

export class SessionEventsHttpError extends Error {
  readonly status: number;
  readonly retryAfterMs: number | null;

  constructor(status: number, message: string, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'SessionEventsHttpError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

export function parseRetryAfterHeader(value: string | null): number | null {
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

export function mergeEvents(events: UiEvent[]): UiEvent[] {
  const dedup = new Map<string, UiEvent>();
  for (const event of events) {
    dedup.set(event.id, event);
  }
  return collapseRealtimeGeminiPartialEvents(
    [...dedup.values()].sort((a, b) => a.timestamp.localeCompare(b.timestamp)),
  );
}

export function isUiEvent(value: unknown): value is UiEvent {
  return Boolean(
    value
      && typeof value === 'object'
      && typeof (value as UiEvent).id === 'string'
      && typeof (value as UiEvent).timestamp === 'string',
  );
}

function readTrimmedStreamEvent(event: UiEvent): string {
  return typeof event.meta?.streamEvent === 'string'
    ? event.meta.streamEvent.trim().toLowerCase()
    : '';
}

function readTrimmedMetaString(event: UiEvent, key: string): string {
  const value = event.meta?.[key];
  return typeof value === 'string' ? value.trim() : '';
}

function isGeminiPendingActionEvent(event: UiEvent): boolean {
  return readTrimmedStreamEvent(event) === 'gemini_action_pending';
}

function isGeminiFinalActionEvent(event: UiEvent): boolean {
  return event.meta?.agent === 'gemini'
    && readTrimmedStreamEvent(event) === 'agent_stream_action';
}

function isGeminiRealtimeTextEvent(event: UiEvent): boolean {
  const streamEvent = readTrimmedStreamEvent(event);
  return streamEvent === 'agent_message_partial' || streamEvent === 'agent_commentary_partial';
}

function isGeminiPersistedTextEvent(event: UiEvent): boolean {
  const streamEvent = readTrimmedStreamEvent(event);
  return (
    streamEvent === 'agent_message'
    || streamEvent === 'agent_message_recovered'
    || streamEvent === 'agent_commentary'
  );
}

function readGeminiTextEventIdentity(event: UiEvent): string | null {
  if (!isGeminiRealtimeTextEvent(event) && !isGeminiPersistedTextEvent(event)) {
    return null;
  }

  const streamEvent = readTrimmedStreamEvent(event);
  const messagePhase = readTrimmedMetaString(event, 'messagePhase');
  const phase = (
    streamEvent === 'agent_commentary_partial'
    || streamEvent === 'agent_commentary'
    || messagePhase === 'commentary'
  )
    ? 'commentary'
    : 'final';
  const turnId = readTrimmedMetaString(event, 'sessionTurnId') || readTrimmedMetaString(event, 'threadId');
  const itemId = readTrimmedMetaString(event, 'sessionItemId');
  if (!turnId && !itemId) {
    return null;
  }

  return [
    phase,
    turnId || '__turn__',
    itemId || '__item__',
  ].join(':');
}

function isRealtimeOnlyEvent(event: UiEvent): boolean {
  const streamEvent = readTrimmedStreamEvent(event);
  return (
    streamEvent === 'gemini_action_pending'
    || streamEvent === 'agent_message_partial'
    || streamEvent === 'agent_commentary_partial'
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
  const finalizedTextEventIdentities = new Set<string>();
  for (const event of events) {
    if (isGeminiFinalActionEvent(event)) {
      const callId = typeof event.meta?.sessionCallId === 'string' ? event.meta.sessionCallId.trim() : '';
      if (callId) {
        finalizedActionCallIds.add(callId);
      }
    }

    if (isGeminiPersistedTextEvent(event)) {
      const identity = readGeminiTextEventIdentity(event);
      if (identity) {
        finalizedTextEventIdentities.add(identity);
      }
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
    if (isGeminiRealtimeTextEvent(event)) {
      const identity = readGeminiTextEventIdentity(event);
      if (!identity) {
        return true;
      }
      return !finalizedTextEventIdentities.has(identity);
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

export function shouldMarkDetachedTailAfterTrim(input: {
  trimFrom: 'start' | 'end';
  trimmedCount: number;
}): boolean {
  return input.trimFrom === 'end' && input.trimmedCount > 0;
}

export function shouldClearDetachedTailAfterLatestAppend(input: {
  hasDetachedTail: boolean;
  hasMoreAfter: boolean | undefined;
}): boolean {
  return input.hasDetachedTail && input.hasMoreAfter === false;
}

export function areEventsEqual(prev: UiEvent[], next: UiEvent[]): boolean {
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

export function appendChatFilters(
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
