import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css');
const tsxPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx');
const css = readFileSync(cssPath, 'utf8');
const tsx = readFileSync(tsxPath, 'utf8');

describe('link preview carousel mobile layout', () => {
  it('keeps the carousel wrapper constrained to the message body width', () => {
    expect(css).toMatch(/\.linkPreviewWrap\s*\{[^}]*width:\s*100%;/s);
    expect(css).toMatch(/\.linkPreviewWrap\s*\{[^}]*max-width:\s*100%;/s);
    expect(css).toMatch(/\.linkPreviewWrap\s*\{[^}]*min-width:\s*0;/s);
    expect(css).toMatch(/\.linkPreviewTrack\s*\{[^}]*max-width:\s*100%;/s);
  });

  it('uses a viewport-safe card width on mobile instead of a fixed pixel basis', () => {
    expect(css).toMatch(/@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.linkPreviewCard\s*\{[^}]*flex:\s*0 0 clamp\(/s);
    expect(css).toMatch(/@media\s*\(max-width:\s*768px\)\s*\{[\s\S]*?\.linkPreviewCard\s*\{[^}]*max-width:\s*100%;/s);
  });

  it('scrolls by the rendered card width instead of a hard-coded desktop value', () => {
    expect(tsx).not.toContain('const cardWidth = 296;');
    expect(tsx).toMatch(/firstElementChild as HTMLElement \| null/);
  });
});
