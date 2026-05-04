import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { abortActiveChat } from '@/lib/runtime/abortChat';

describe('abortActiveChat', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('POSTs the abort action with chatId trimmed', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: { accepted: true, message: 'ok' } }),
    });

    const result = await abortActiveChat({ sessionId: 'sess-1', chatId: '  chat-9  ' });

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toBe('/api/runtime/sessions/sess-1/actions');
    expect(init.method).toBe('POST');
    expect(init.cache).toBe('no-store');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
    expect(JSON.parse(init.body as string)).toEqual({ action: 'abort', chatId: 'chat-9' });
    expect(result).toEqual({ accepted: true, message: 'ok' });
  });

  it('omits chatId when blank', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ result: {} }),
    });

    await abortActiveChat({ sessionId: 'sess-2', chatId: '   ' });

    const [, init] = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string)).toEqual({ action: 'abort', chatId: undefined });
  });

  it('throws with backend error when not ok', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: '권한 없음' }),
    });

    await expect(abortActiveChat({ sessionId: 'sess-3' })).rejects.toThrow('권한 없음');
  });

  it('throws default message when error body missing', async () => {
    (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({}),
    });

    await expect(abortActiveChat({ sessionId: 'sess-4' })).rejects.toThrow('에이전트 실행 중단에 실패했습니다.');
  });
});
