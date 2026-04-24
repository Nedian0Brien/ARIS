import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { hasAppBasePath, withAppBasePath } from '@/lib/routing/appPath';

const __dirname = dirname(fileURLToPath(import.meta.url));

describe('proxy-safe client routing', () => {
  it('prefixes same-app absolute paths when the app is previewed under /proxy/<port>', () => {
    expect(withAppBasePath('/api/auth/login', '/proxy/3317')).toBe('/proxy/3317/api/auth/login');
    expect(withAppBasePath('api/auth/verify-2fa', '/proxy/3317/')).toBe('/proxy/3317/api/auth/verify-2fa');
    expect(withAppBasePath('/', '/proxy/3317')).toBe('/proxy/3317/');
  });

  it('does not double-prefix or rewrite external URLs', () => {
    expect(withAppBasePath('/proxy/3317/api/auth/login', '/proxy/3317')).toBe('/proxy/3317/api/auth/login');
    expect(withAppBasePath('https://example.com/api/auth/login', '/proxy/3317')).toBe('https://example.com/api/auth/login');
    expect(withAppBasePath('/api/auth/login', '')).toBe('/api/auth/login');
  });

  it('detects whether document navigation should keep a proxy prefix', () => {
    expect(hasAppBasePath('/proxy/3317')).toBe(true);
    expect(hasAppBasePath('/')).toBe(false);
    expect(hasAppBasePath('')).toBe(false);
  });

  it('exposes the proxy prefix to client-side code at build time', () => {
    const nextConfig = readFileSync(resolve(__dirname, '../next.config.ts'), 'utf8');

    expect(nextConfig).toContain('NEXT_PUBLIC_ARIS_WEB_ASSET_PREFIX');
  });

  it('uses proxy-aware paths for login submissions and post-login navigation', () => {
    const loginPage = readFileSync(resolve(__dirname, '../app/login/page.tsx'), 'utf8');

    expect(loginPage).toContain("withAppBasePath('/api/auth/login')");
    expect(loginPage).toContain("withAppBasePath('/api/auth/verify-2fa')");
    expect(loginPage).toContain("navigateAfterAuth('/')");
  });
});
