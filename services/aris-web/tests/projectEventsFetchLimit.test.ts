import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getProjectEvents fetch limits', () => {
  const originalEnv = {
    RUNTIME_API_URL: process.env.RUNTIME_API_URL,
    RUNTIME_API_TOKEN: process.env.RUNTIME_API_TOKEN,
  };

  beforeEach(() => {
    vi.resetModules();
    process.env.RUNTIME_API_URL = 'http://runtime.test';
    process.env.RUNTIME_API_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.RUNTIME_API_URL = originalEnv.RUNTIME_API_URL;
    process.env.RUNTIME_API_TOKEN = originalEnv.RUNTIME_API_TOKEN;
  });

  it('clamps chat-scoped project message fetches to the Happy API max page size', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith('/v1/projects')) {
        return new Response(JSON.stringify({
          sessions: [
            { id: 'session-1', seq: 900 },
          ],
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      if (url.includes('/v3/projects/session-1/messages?')) {
        return new Response(JSON.stringify({
          messages: [],
          hasMore: false,
          lastSeq: 900,
        }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    const { getProjectEvents } = await import('@/lib/happy/client');
    await getProjectEvents('session-1', {
      chatId: 'chat-1',
      limit: 40,
    });

    const messageCall = fetchMock.mock.calls.find(([input]) => String(input).includes('/v3/projects/session-1/messages?'));
    expect(messageCall).toBeTruthy();

    const url = new URL(String(messageCall?.[0]));
    expect(url.searchParams.get('limit')).toBe('500');
  });
});
