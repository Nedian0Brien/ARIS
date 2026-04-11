import { describe, expect, it, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import type { UiEvent } from '@/lib/happy/types';

const mocks = vi.hoisted(() => ({
  requireApiUser: vi.fn(),
  streamSessionEvents: vi.fn(),
  getSessionRealtimeEvents: vi.fn(),
  HappyHttpError: class MockHappyHttpError extends Error {
    readonly status: number;
    readonly retryAfterMs: number | null;

    constructor(status: number, message: string, retryAfterMs: number | null = null) {
      super(message);
      this.status = status;
      this.retryAfterMs = retryAfterMs;
    }
  },
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/happy/client', () => ({
  streamSessionEvents: mocks.streamSessionEvents,
  getSessionRealtimeEvents: mocks.getSessionRealtimeEvents,
  HappyHttpError: mocks.HappyHttpError,
}));

import { GET } from '@/app/api/runtime/sessions/[sessionId]/events/stream/route';

function buildEvent(overrides: Partial<UiEvent> = {}): UiEvent {
  return {
    id: overrides.id ?? 'evt-1',
    timestamp: overrides.timestamp ?? '2026-03-14T05:17:02.390Z',
    kind: overrides.kind ?? 'file_read',
    title: overrides.title ?? 'File Read',
    body: overrides.body ?? 'path: services/aris-web/app/SessionDashboard.tsx',
    meta: {
      chatId: 'chat-1',
      streamEvent: 'agent_stream_action',
      ...(overrides.meta ?? {}),
    },
  };
}

describe('session events stream route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { id: 'user-1' } });
  });

  it('replays the initial event page when the stream starts without an after cursor', async () => {
    const initialEvent = buildEvent();

    // realtime events: 빈 결과 반환 (정상)
    mocks.getSessionRealtimeEvents.mockResolvedValue({ events: [], cursor: 0 });

    // DB events: 첫 번째 호출에서 이벤트 반환, 이후 404로 스트림 종료
    mocks.streamSessionEvents
      .mockResolvedValueOnce({ events: [initialEvent], latestSeq: 42 })
      .mockRejectedValue(new mocks.HappyHttpError(404, 'session not found'));

    const response = await GET(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/events/stream?chatId=chat-1'),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    const payload = await response.text();

    expect(mocks.streamSessionEvents).toHaveBeenCalledWith('session-1', {
      after: undefined,
      limit: 40,
      chatId: 'chat-1',
      includeUnassigned: false,
      latestSeqHint: undefined,
    });
    expect(mocks.getSessionRealtimeEvents).toHaveBeenCalledWith({
      sessionId: 'session-1',
      afterCursor: 0,
      chatId: 'chat-1',
    });
    expect(payload).toContain('event: event');
    expect(payload).toContain(`"id":"${initialEvent.id}"`);
  });

  it('delivers realtime events before DB events in each polling cycle', async () => {
    const realtimeEvent = buildEvent({
      id: 'rt-1',
      meta: { streamEvent: 'gemini_action_pending', sessionCallId: 'call-1' },
    });
    const dbEvent = buildEvent({ id: 'db-1' });

    mocks.getSessionRealtimeEvents
      .mockResolvedValueOnce({ events: [realtimeEvent], cursor: 1 })
      .mockResolvedValue({ events: [], cursor: 1 });

    mocks.streamSessionEvents
      .mockResolvedValueOnce({ events: [dbEvent], latestSeq: 10 })
      .mockRejectedValue(new mocks.HappyHttpError(404, 'done'));

    const response = await GET(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/events/stream'),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    const payload = await response.text();

    // realtime event가 DB event보다 먼저 payload에 등장해야 함
    const rtPos = payload.indexOf('"id":"rt-1"');
    const dbPos = payload.indexOf('"id":"db-1"');
    expect(rtPos).toBeGreaterThanOrEqual(0);
    expect(dbPos).toBeGreaterThanOrEqual(0);
    expect(rtPos).toBeLessThan(dbPos);
  });

  it('does not enqueue late events after the request aborts', async () => {
    let resolveRealtime!: (value: { events: UiEvent[]; cursor: number }) => void;
    const realtimePromise = new Promise<{ events: UiEvent[]; cursor: number }>((resolve) => {
      resolveRealtime = resolve;
    });

    mocks.getSessionRealtimeEvents
      .mockReturnValueOnce(realtimePromise)
      .mockResolvedValue({ events: [], cursor: 1 });
    mocks.streamSessionEvents.mockResolvedValue({ events: [], latestSeq: 0 });

    const abortController = new AbortController();
    const response = await GET(
      new NextRequest('http://localhost/api/runtime/sessions/session-1/events/stream', {
        signal: abortController.signal,
      }),
      { params: Promise.resolve({ sessionId: 'session-1' }) },
    );

    abortController.abort();
    resolveRealtime({
      events: [buildEvent({ id: 'late-rt-1' })],
      cursor: 1,
    });

    const payload = await response.text();

    expect(payload).toContain('event: ready');
    expect(payload).not.toContain('late-rt-1');
  });
});
