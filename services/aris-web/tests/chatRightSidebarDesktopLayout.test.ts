import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfaceCssPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css');

const chatInterfaceCss = readFileSync(chatInterfaceCssPath, 'utf8');

describe('chat workspace panel layout guards', () => {
  it('keeps the desktop shell on the left-sidebar plus center-panel grid only', () => {
    expect(chatInterfaceCss).toMatch(/\.chatShellSidebarOpen\s*\{[^}]*grid-template-columns:\s*280px minmax\(0,\s*1fr\);/s);
    expect(chatInterfaceCss).toMatch(/\.chatShellSidebarClosed\s*\{[^}]*grid-template-columns:\s*0 minmax\(0,\s*1fr\);/s);
  });

  it('keeps the left overlay fallback as a two-column layout without reviving a right lane', () => {
    expect(chatInterfaceCss).toMatch(/\.chatShellLeftOverlay\s*\{[^}]*grid-template-columns:\s*0 minmax\(720px,\s*1fr\);/s);
  });

  it('removes the old dedicated right-lane grid and drawer rules entirely', () => {
    expect(chatInterfaceCss).not.toContain('.chatShellRightPinned');
    expect(chatInterfaceCss).not.toContain('.customizationDrawer');
    expect(chatInterfaceCss).not.toContain('.customizationBackdrop');
    expect(chatInterfaceCss).not.toContain('.rightPanel');
  });
});
