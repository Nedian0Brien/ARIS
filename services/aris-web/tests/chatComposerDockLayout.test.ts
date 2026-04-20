import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfaceTsxPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx');
const chatInterfaceCssPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css');

const chatInterfaceTsx = readFileSync(chatInterfaceTsxPath, 'utf8');
const chatInterfaceCss = readFileSync(chatInterfaceCssPath, 'utf8');

describe('chat composer dock desktop layout guards', () => {
  it('syncs composer dock metrics before paint so new chats do not flash into the sidebar lane', () => {
    expect(chatInterfaceTsx).toMatch(/useLayoutEffect/);
    expect(chatInterfaceTsx).toMatch(/useLayoutEffect\(\(\) => \{\s*syncComposerDockMetrics\(\);/s);
  });

  it('uses a desktop-safe default dock width instead of expanding across the full viewport', () => {
    expect(chatInterfaceCss).not.toContain('--composer-dock-width: calc(100vw - 1.5rem);');
  });
});
