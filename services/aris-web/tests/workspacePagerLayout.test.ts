import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const cssPath = resolve(__dirname, '../app/sessions/[sessionId]/workspace-panels/WorkspacePager.module.css');
const css = readFileSync(cssPath, 'utf8');

describe('workspace pager layout', () => {
  it('keeps native horizontal scrolling enabled for panel swipes', () => {
    expect(css).toMatch(/\.pager\s*\{[^}]*overflow-x:\s*auto;/s);
    expect(css).toMatch(/\.pager\s*\{[^}]*scroll-snap-type:\s*x mandatory;/s);
    expect(css).toMatch(/\.pager\s*\{[^}]*-webkit-overflow-scrolling:\s*touch;/s);
  });

  it('anchors each workspace page to the scroll snap track', () => {
    expect(css).toMatch(/\.page\s*\{[^}]*scroll-snap-align:\s*start;/s);
    expect(css).toMatch(/\.page\s*\{[^}]*scroll-snap-stop:\s*always;/s);
  });
});
