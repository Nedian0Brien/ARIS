import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const customizationSidebarCssPath = resolve(__dirname, '../app/sessions/[sessionId]/CustomizationSidebar.module.css');

const customizationSidebarCss = readFileSync(customizationSidebarCssPath, 'utf8');

describe('customization sidebar desktop workspace layout guards', () => {
  it('drops the nested right-sidebar chrome in desktop panel mode', () => {
    expect(customizationSidebarCss).toMatch(/\.sidebarRootDesktop\s*\{[^}]*border:\s*none;/s);
    expect(customizationSidebarCss).toMatch(/\.sidebarRootDesktop\s*\{[^}]*background:\s*transparent;/s);
    expect(customizationSidebarCss).toMatch(/\.sidebarRootDesktop\s*\{[^}]*box-shadow:\s*none;/s);
  });

  it('keeps a sticky desktop workspace header with summary cards', () => {
    expect(customizationSidebarCss).toMatch(/@media\s*\(min-width:\s*960px\)\s*\{[\s\S]*?\.sidebarRootDesktop\s+\.header\s*\{[^}]*position:\s*sticky;/s);
    expect(customizationSidebarCss).toMatch(/\.headerSummaryGrid\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);/s);
  });

  it('uses wider desktop layouts for file controls and git workbench', () => {
    expect(customizationSidebarCss).toMatch(/@media\s*\(min-width:\s*960px\)\s*\{[\s\S]*?\.filesToolbar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1\.4fr\)\s+auto;/s);
    expect(customizationSidebarCss).toMatch(/@media\s*\(min-width:\s*1280px\)\s*\{[\s\S]*?\.gitWorkbench\s*\{[^}]*grid-template-columns:\s*minmax\(280px,\s*0\.9fr\)\s+minmax\(260px,\s*0\.88fr\)\s+minmax\(0,\s*1\.22fr\);/s);
  });
});
