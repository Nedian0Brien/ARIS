/**
 * RealtimeEventBus — in-memory ring buffer of session realtime events.
 *
 * Owned by `runtime/runtimeCore.ts` until 2.5d, where it moves into a
 * standalone module so the runtime core can shrink and so future
 * subscribers (SSE polling, WebSocket fanout) can take a stable
 * dependency on a focused surface.
 *
 * Buffer semantics (preserved verbatim from runtimeCore.ts):
 *   - Per-session bucket capped at 500 entries; overflow drops the
 *     oldest entries via `splice(0, bucket.length - 500)`.
 *   - Cursor monotonically increases per session and is independent of
 *     other sessions. Cursor `0` means "no events observed yet".
 *   - `list()` returns events whose cursor strictly exceeds
 *     `options.afterCursor`, optionally filtered by `chatId`, and
 *     truncated to the most recent `options.limit` (default 100).
 *
 * The bus does NOT persist anything — it is a process-local cache that
 * survives only for the lifetime of the runtime core. Long-term
 * persistence is the responsibility of the storage layer (PrismaStore
 * `chatEvents`).
 */

import type { RuntimeMessage, RuntimeProject } from '../../types.js';

/**
 * One entry in a session bucket. Verbatim port of the inline type that
 * lived in runtimeCore.ts.
 */
export interface SessionRealtimeEventRecord {
  cursor: number;
  event: RuntimeMessage;
}

/**
 * Options for `RealtimeEventBus.list`.
 */
export interface ListRealtimeEventsOptions {
  /** Returns events whose cursor strictly exceeds this value. Defaults to 0. */
  afterCursor?: number;
  /** Maximum number of (most-recent) events to return. Defaults to 100. */
  limit?: number;
  /** Optional chat scope filter; matches against `event.meta.chatId`. */
  chatId?: string;
}

export type RealtimeEventBusListener = (record: SessionRealtimeEventRecord) => void;

/**
 * Host-side callbacks the bus needs.
 */
export interface RealtimeEventBusDeps {
  /** Resolves an ARIS session by id; null when session does not exist. */
  getProject(projectId: string): Promise<RuntimeProject | null>;
}

/** Hard cap on entries per session bucket. */
const SESSION_BUCKET_CAP = 500;
/** Default `list` page size. */
const DEFAULT_LIST_LIMIT = 100;

export class RealtimeEventBus {
  private readonly events = new Map<string, SessionRealtimeEventRecord[]>();
  private readonly cursors = new Map<string, number>();
  private readonly subscribers = new Map<string, Set<{
    options: Pick<ListRealtimeEventsOptions, 'chatId'>;
    listener: RealtimeEventBusListener;
  }>>();

  constructor(private readonly deps: RealtimeEventBusDeps) {}

  /**
   * Append a realtime event for a session and return the event verbatim.
   * Returning the input lets callers chain: `const e = bus.append(...)`.
   */
  append(projectId: string, event: RuntimeMessage): RuntimeMessage {
    const nextCursor = (this.cursors.get(projectId) ?? 0) + 1;
    this.cursors.set(projectId, nextCursor);
    const bucket = this.events.get(projectId) ?? [];
    bucket.push({ cursor: nextCursor, event });
    if (bucket.length > SESSION_BUCKET_CAP) {
      bucket.splice(0, bucket.length - SESSION_BUCKET_CAP);
    }
    this.events.set(projectId, bucket);
    this.notify(projectId, { cursor: nextCursor, event });
    return event;
  }

  subscribe(
    projectId: string,
    options: Pick<ListRealtimeEventsOptions, 'chatId'>,
    listener: RealtimeEventBusListener,
  ): () => void {
    const subscribers = this.subscribers.get(projectId) ?? new Set();
    const subscription = { options, listener };
    subscribers.add(subscription);
    this.subscribers.set(projectId, subscribers);
    return () => {
      subscribers.delete(subscription);
      if (subscribers.size === 0) {
        this.subscribers.delete(projectId);
      }
    };
  }

  /**
   * List session events newer than `options.afterCursor`. Validates the
   * project exists via `deps.getProject`; throws `SESSION_NOT_FOUND` when
   * the session is absent (preserves the legacy contract for HTTP
   * handlers that translate that error to 404).
   */
  async list(
    projectId: string,
    options: ListRealtimeEventsOptions = {},
  ): Promise<{ events: RuntimeMessage[]; cursor: number }> {
    const session = await this.deps.getProject(projectId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const bucket = this.events.get(projectId) ?? [];
    const normalizedAfterCursor = Number.isFinite(options.afterCursor)
      ? Math.max(0, Math.floor(Number(options.afterCursor)))
      : 0;
    const normalizedLimit = Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(Number(options.limit)))
      : DEFAULT_LIST_LIMIT;

    const events = bucket
      .filter((entry) => entry.cursor > normalizedAfterCursor)
      .filter((entry) => {
        if (!options.chatId) {
          return true;
        }
        const chatId = typeof entry.event.meta?.chatId === 'string'
          ? entry.event.meta.chatId.trim()
          : '';
        return chatId === options.chatId;
      })
      .slice(-normalizedLimit)
      .map((entry) => entry.event);

    return {
      events,
      cursor: this.cursors.get(projectId) ?? 0,
    };
  }

  private notify(projectId: string, record: SessionRealtimeEventRecord): void {
    const subscribers = this.subscribers.get(projectId);
    if (!subscribers || subscribers.size === 0) {
      return;
    }
    for (const subscriber of subscribers) {
      if (!matchesChatFilter(record.event, subscriber.options.chatId)) {
        continue;
      }
      subscriber.listener(record);
    }
  }
}

function matchesChatFilter(event: RuntimeMessage, chatId?: string): boolean {
  if (!chatId) {
    return true;
  }
  const eventChatId = typeof event.meta?.chatId === 'string'
    ? event.meta.chatId.trim()
    : '';
  return eventChatId === chatId;
}
