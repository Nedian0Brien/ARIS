import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfaceCssPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css');
const chatInterfaceCss = readFileSync(chatInterfaceCssPath, 'utf8');

describe('chat composer layout guards', () => {
  it('lets the composer card and row shrink cleanly within narrow layouts', () => {
    expect(chatInterfaceCss).toMatch(/\.composerCard\s*\{[^}]*min-width:\s*0;/s);
    expect(chatInterfaceCss).toMatch(/\.composerCard\s*\{[^}]*max-width:\s*100%;/s);
    expect(chatInterfaceCss).toMatch(/\.composerInputRow\s*\{[^}]*min-width:\s*0;/s);
    expect(chatInterfaceCss).toMatch(/\.composerInputRow\s*\{[^}]*width:\s*100%;/s);
    expect(chatInterfaceCss).toMatch(/\.composerInputRow\s*\{[^}]*max-width:\s*100%;/s);
  });

  it('allows the textarea to shrink without forcing the last word onto a new line', () => {
    expect(chatInterfaceCss).toMatch(/\.composerInput\s*\{[^}]*min-width:\s*0;/s);
    expect(chatInterfaceCss).toMatch(/\.composerInput\s*\{[^}]*width:\s*100%;/s);
    expect(chatInterfaceCss).toMatch(/\.composerInput\s*\{[^}]*max-width:\s*100%;/s);
  });
});
