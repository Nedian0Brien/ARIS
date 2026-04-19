import { describe, expect, it } from 'vitest';
import { assertServerHealthy } from '@/scripts/run-mobile-overflow-e2e.mjs';

type MobileOverflowSupportModule = {
  isIgnorableMobileOverflowScreenshotError?: (error: unknown) => boolean;
  shouldRetryMobileOverflowPreflight?: (input: { status?: number; detail?: string }) => boolean;
};

async function loadMobileOverflowSupportModule(): Promise<MobileOverflowSupportModule> {
  return import('@/tests/e2e/mobileOverflowSupport.mjs').catch(() => ({}));
}

describe('mobile overflow support helpers', () => {
  it('treats screenshot timeout while waiting for fonts as ignorable debug noise', async () => {
    const mod = await loadMobileOverflowSupportModule();

    expect(typeof mod.isIgnorableMobileOverflowScreenshotError).toBe('function');
    if (typeof mod.isIgnorableMobileOverflowScreenshotError !== 'function') return;

    expect(mod.isIgnorableMobileOverflowScreenshotError(
      new Error('page.screenshot: Test timeout of 90000ms exceeded. waiting for fonts to load...'),
    )).toBe(true);
  });

  it('does not ignore unrelated screenshot failures', async () => {
    const mod = await loadMobileOverflowSupportModule();

    expect(typeof mod.isIgnorableMobileOverflowScreenshotError).toBe('function');
    if (typeof mod.isIgnorableMobileOverflowScreenshotError !== 'function') return;

    expect(mod.isIgnorableMobileOverflowScreenshotError(
      new Error('page.screenshot: Protocol error (Page.captureScreenshot): Target closed'),
    )).toBe(false);
  });

  it('retries mobile overflow preflight while the local dev server is still warming up', async () => {
    const mod = await loadMobileOverflowSupportModule();

    expect(typeof mod.shouldRetryMobileOverflowPreflight).toBe('function');
    if (typeof mod.shouldRetryMobileOverflowPreflight !== 'function') return;

    expect(mod.shouldRetryMobileOverflowPreflight({
      detail: 'The operation was aborted due to timeout',
    })).toBe(true);
    expect(mod.shouldRetryMobileOverflowPreflight({
      detail: 'fetch failed',
    })).toBe(true);
    expect(mod.shouldRetryMobileOverflowPreflight({
      status: 503,
      detail: '<!DOCTYPE html><html><body>Compiling...</body></html>',
    })).toBe(true);
  });

  it('does not retry mobile overflow preflight for stable client-side failures', async () => {
    const mod = await loadMobileOverflowSupportModule();

    expect(typeof mod.shouldRetryMobileOverflowPreflight).toBe('function');
    if (typeof mod.shouldRetryMobileOverflowPreflight !== 'function') return;

    expect(mod.shouldRetryMobileOverflowPreflight({
      status: 401,
      detail: 'Unauthorized',
    })).toBe(false);
    expect(mod.shouldRetryMobileOverflowPreflight({
      status: 404,
      detail: 'Not Found',
    })).toBe(false);
  });

  it('keeps retrying fetch failures until the login page becomes reachable', async () => {
    let attempts = 0;
    const sleepCalls: number[] = [];

    await expect(assertServerHealthy('http://127.0.0.1:3999', {
      retryAttempts: 4,
      delayMs: 25,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts < 3) {
          throw new TypeError('fetch failed');
        }

        return {
          ok: true,
          status: 200,
          text: async () => 'ok',
        };
      },
      sleep: async (delayMs: number) => {
        sleepCalls.push(delayMs);
      },
    })).resolves.toBeUndefined();

    expect(attempts).toBe(3);
    expect(sleepCalls).toEqual([25, 25]);
  });

  it('retries compile-time 503 responses before treating the server as unhealthy', async () => {
    let attempts = 0;
    const sleepCalls: number[] = [];

    await expect(assertServerHealthy('http://127.0.0.1:3999', {
      retryAttempts: 3,
      delayMs: 10,
      fetchImpl: async () => {
        attempts += 1;
        if (attempts < 3) {
          return {
            ok: false,
            status: 503,
            text: async () => '<!DOCTYPE html><html><body>Compiling...</body></html>',
          };
        }

        return {
          ok: true,
          status: 200,
          text: async () => 'ok',
        };
      },
      sleep: async (delayMs: number) => {
        sleepCalls.push(delayMs);
      },
    })).resolves.toBeUndefined();

    expect(attempts).toBe(3);
    expect(sleepCalls).toEqual([10, 10]);
  });
});
