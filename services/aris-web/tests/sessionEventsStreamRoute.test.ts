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

    mocks.streamSessionEvents.mockResolvedValueOnce({
      events: [initialEvent],
      latestSeq: 42,
    });
    mocks.getSessionRealtimeEvents.mockRejectedValueOnce(new mocks.HappyHttpError(404, 'stream closed'));

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
    expect(payload).toContain('event: event');
    expect(payload).toContain(`"id":"${initialEvent.id}"`);
    expect(payload).toContain('"status":404');
  });
});
