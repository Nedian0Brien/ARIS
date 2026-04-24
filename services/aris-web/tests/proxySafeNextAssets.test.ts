import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const nextConfig = readFileSync(resolve(__dirname, '../next.config.ts'), 'utf8');

describe('proxy-safe Next asset paths', () => {
  it('allows preview servers behind /proxy/<port> to emit prefixed Next assets', () => {
    expect(nextConfig).toContain('ARIS_WEB_ASSET_PREFIX');
    expect(nextConfig).toMatch(/assetPrefix:\s*arisWebAssetPrefix/);
  });
});
