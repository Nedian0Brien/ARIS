import { describe, expect, it } from 'vitest';
import { resolveRuntimeApiToken, resolveRuntimeApiUrl } from '@/lib/config';

describe('runtime api env resolution', () => {
  it('uses RUNTIME_API_URL when set', () => {
    expect(resolveRuntimeApiUrl({
      RUNTIME_API_URL: 'http://127.0.0.1:4080',
    })).toBe('http://127.0.0.1:4080');

    expect(resolveRuntimeApiToken({
      RUNTIME_API_TOKEN: 'runtime-token',
    })).toBe('runtime-token');
  });

  it('uses defaults when runtime api env is missing', () => {
    expect(resolveRuntimeApiUrl({
      RUNTIME_API_URL: undefined,
    })).toBe('http://localhost:4080');

    expect(resolveRuntimeApiToken({
      RUNTIME_API_TOKEN: undefined,
    })).toBeUndefined();
  });

  it('treats whitespace-only RUNTIME_API_URL as missing', () => {
    expect(resolveRuntimeApiUrl({
      RUNTIME_API_URL: '   ',
    })).toBe('http://localhost:4080');

    expect(resolveRuntimeApiToken({
      RUNTIME_API_TOKEN: '   ',
    })).toBeUndefined();
  });
});
