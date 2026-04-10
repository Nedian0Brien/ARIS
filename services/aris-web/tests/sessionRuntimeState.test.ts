import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

describe('getSessionRuntimeState', () => {
  const originalEnv = {
    RUNTIME_API_URL: process.env.RUNTIME_API_URL,
    RUNTIME_API_TOKEN: process.env.RUNTIME_API_TOKEN,
    HAPPY_SERVER_URL: process.env.HAPPY_SERVER_URL,
    HAPPY_SERVER_TOKEN: process.env.HAPPY_SERVER_TOKEN,
  };

  beforeEach(() => {
    vi.resetModules();
    process.env.RUNTIME_API_URL = 'http://runtime.test';
    process.env.RUNTIME_API_TOKEN = 'test-token';
    process.env.HAPPY_SERVER_URL = 'http://runtime.test';
    process.env.HAPPY_SERVER_TOKEN = 'test-token';
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    process.env.RUNTIME_API_URL = originalEnv.RUNTIME_API_URL;
    process.env.RUNTIME_API_TOKEN = originalEnv.RUNTIME_API_TOKEN;
    process.env.HAPPY_SERVER_URL = originalEnv.HAPPY_SERVER_URL;
    process.env.HAPPY_SERVER_TOKEN = originalEnv.HAPPY_SERVER_TOKEN;
  });

  it('returns Codex quota usage from the runtime endpoint', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({
      sessionId: 'session-1',
      isRunning: true,
      codexQuotaUsage: {
        inputTokens: 1234,
        cachedInputTokens: 222,
        outputTokens: 56,
        totalTokens: 1290,
        updatedAt: '2026-04-11T02:00:00.000Z',
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
    vi.stubGlobal('fetch', fetchMock);

    const { getSessionRuntimeState } = await import('@/lib/happy/client');
    const state = await getSessionRuntimeState('session-1', { chatId: 'chat-1' });

    expect(state).toMatchObject({
      sessionId: 'session-1',
      isRunning: true,
      codexQuotaUsage: {
        inputTokens: 1234,
        cachedInputTokens: 222,
        outputTokens: 56,
        totalTokens: 1290,
      },
    });
  });
});
