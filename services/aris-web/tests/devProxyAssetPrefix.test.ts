import { describe, expect, it } from 'vitest';
import { resolveDevProxyAssetPrefix } from '@/lib/routing/devProxyAssetPrefix.mjs';

describe('dev proxy asset prefix resolution', () => {
  it('defaults a raw dev server to the current code-server proxy port', () => {
    const resolved = resolveDevProxyAssetPrefix({
      dev: true,
      port: 3317,
      serverPrefix: undefined,
      clientPrefix: undefined,
    });

    expect(resolved.serverPrefix).toBe('/proxy/3317');
    expect(resolved.clientPrefix).toBe('/proxy/3317');
    expect(resolved.changed).toBe(true);
  });

  it('replaces stale /proxy/<port> prefixes with the current server port', () => {
    const resolved = resolveDevProxyAssetPrefix({
      dev: true,
      port: 3317,
      serverPrefix: '/proxy/3305',
      clientPrefix: '/proxy/3305',
    });

    expect(resolved.serverPrefix).toBe('/proxy/3317');
    expect(resolved.clientPrefix).toBe('/proxy/3317');
    expect(resolved.changed).toBe(true);
  });

  it('preserves explicit non-proxy asset prefixes', () => {
    const resolved = resolveDevProxyAssetPrefix({
      dev: true,
      port: 3317,
      serverPrefix: '/preview/aris',
      clientPrefix: undefined,
    });

    expect(resolved.serverPrefix).toBe('/preview/aris');
    expect(resolved.clientPrefix).toBe('/preview/aris');
    expect(resolved.changed).toBe(true);
  });

  it('can be disabled when plain localhost asset paths are intentional', () => {
    const resolved = resolveDevProxyAssetPrefix({
      dev: true,
      port: 3317,
      serverPrefix: undefined,
      clientPrefix: undefined,
      autoProxyPrefix: '0',
    });

    expect(resolved.serverPrefix).toBe('');
    expect(resolved.clientPrefix).toBe('');
    expect(resolved.changed).toBe(false);
  });
});
