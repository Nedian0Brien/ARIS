import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfaceCssPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css');

const chatInterfaceCss = readFileSync(chatInterfaceCssPath, 'utf8');

describe('chat right sidebar desktop layout guards', () => {
  it('allocates a dedicated third grid column for the pinned desktop customization pane', () => {
    expect(chatInterfaceCss).toMatch(/\.chatShellRightPinned\s*\{[^}]*grid-template-columns:\s*280px minmax\(720px,\s*1fr\) 320px;/s);
  });

  it('keeps the right pane in-row even when the left sidebar switches to overlay mode', () => {
    expect(chatInterfaceCss).toMatch(/\.chatShellRightPinned\.chatShellLeftOverlay\s*\{[^}]*grid-template-columns:\s*0 minmax\(720px,\s*1fr\) 320px;/s);
  });

  it('only hides the right pane below 1280px when the pinned desktop layout is inactive', () => {
    expect(chatInterfaceCss).toMatch(/@media\s*\(max-width:\s*1280px\)\s*\{[\s\S]*?\.rightPanel\s*\{[^}]*display:\s*none;[\s\S]*?\.chatShellRightPinned\s*>\s*\.rightPanel\s*\{[^}]*display:\s*block;/s);
  });
});
