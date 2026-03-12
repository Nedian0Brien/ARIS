import { describe, expect, it } from 'vitest';
import { resolveRuntimeApiToken, resolveRuntimeApiUrl } from '@/lib/config';

describe('runtime api env resolution', () => {
  it('prefers explicit runtime api values', () => {
    expect(resolveRuntimeApiUrl({
      RUNTIME_API_URL: 'http://127.0.0.1:4080',
      HAPPY_SERVER_URL: 'http://127.0.0.1:3005',
    })).toBe('http://127.0.0.1:4080');

    expect(resolveRuntimeApiToken({
      RUNTIME_API_TOKEN: 'runtime-token',
      HAPPY_SERVER_TOKEN: 'legacy-token',
    })).toBe('runtime-token');
  });

  it('falls back to legacy happy env names', () => {
    expect(resolveRuntimeApiUrl({
      RUNTIME_API_URL: undefined,
      HAPPY_SERVER_URL: 'http://127.0.0.1:4080',
    })).toBe('http://127.0.0.1:4080');

    expect(resolveRuntimeApiToken({
      RUNTIME_API_TOKEN: undefined,
      HAPPY_SERVER_TOKEN: 'legacy-token',
    })).toBe('legacy-token');
  });

  it('uses defaults when runtime api env is missing', () => {
    expect(resolveRuntimeApiUrl({
      RUNTIME_API_URL: undefined,
      HAPPY_SERVER_URL: undefined,
    })).toBe('http://localhost:4080');

    expect(resolveRuntimeApiToken({
      RUNTIME_API_TOKEN: undefined,
      HAPPY_SERVER_TOKEN: undefined,
    })).toBeUndefined();
  });
});
