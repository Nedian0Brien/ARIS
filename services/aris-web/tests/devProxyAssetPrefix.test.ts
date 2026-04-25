import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  isNextDevHmrPath,
  resolveDevProxyAssetPrefix,
  withNextDevHmrAssetPrefix,
} from '@/lib/routing/devProxyAssetPrefix.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

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

  it('recognizes HMR websocket upgrade paths with or without the proxy prefix', () => {
    expect(isNextDevHmrPath('/_next/webpack-hmr', '/proxy/3317')).toBe(true);
    expect(isNextDevHmrPath('/proxy/3317/_next/webpack-hmr', '/proxy/3317')).toBe(true);
    expect(isNextDevHmrPath('/ws/terminal/session-id', '/proxy/3317')).toBe(false);
  });

  it('restores the asset prefix when code-server strips it before forwarding HMR upgrades', () => {
    expect(withNextDevHmrAssetPrefix('/_next/webpack-hmr', '/proxy/3317')).toBe('/proxy/3317/_next/webpack-hmr');
    expect(withNextDevHmrAssetPrefix('/_next/webpack-hmr?transport=websocket', '/proxy/3317')).toBe(
      '/proxy/3317/_next/webpack-hmr?transport=websocket',
    );
    expect(withNextDevHmrAssetPrefix('/proxy/3317/_next/webpack-hmr', '/proxy/3317')).toBe(
      '/proxy/3317/_next/webpack-hmr',
    );
  });

  it('delegates Next HMR upgrades before custom terminal websocket fallback', () => {
    const server = readFileSync(resolve(__dirname, '../server.mjs'), 'utf8');
    const hmrCheckIndex = server.indexOf('if (dev && isNextDevHmrPath');
    const terminalFallbackIndex = server.indexOf("pathname.startsWith('/ws/terminal')");

    expect(hmrCheckIndex).toBeGreaterThan(-1);
    expect(terminalFallbackIndex).toBeGreaterThan(-1);
    expect(hmrCheckIndex).toBeLessThan(terminalFallbackIndex);
    expect(server).toContain('nextUpgradeHandler(req, socket, head)');
  });

  it('packages the proxy asset-prefix helper required by the production server image', () => {
    const server = readFileSync(resolve(__dirname, '../server.mjs'), 'utf8');
    const dockerfile = readFileSync(resolve(__dirname, '../Dockerfile'), 'utf8');

    expect(server).toContain('./lib/routing/devProxyAssetPrefix.mjs');
    expect(dockerfile).toContain('COPY --link --from=builder /app/lib ./lib');
  });
});
