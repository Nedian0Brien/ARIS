import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const homeClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');
const uiCss = readFileSync(resolve(__dirname, '../app/styles/ui.css'), 'utf8');

describe('ARIS IA v3 implementation', () => {
  it('adds the acronym and ambient command console to the home surface', () => {
    expect(homeClient).toContain('className="home-acronym"');
    expect(homeClient).toContain('aria-label="Agentic Runtime Integration System"');
    expect(homeClient).toContain('home-acronym__lead');
    expect(homeClient).toContain('home-acronym__rest');
    expect(homeClient).toContain('className="cmd-console"');
    expect(homeClient).toContain('aria-hidden="true"');
    expect(homeClient).toContain('cmd-console__viewport');
  });

  it('implements the command console as a bounded reduced-motion-aware sequence', () => {
    expect(homeClient).toContain('CMD_CONSOLE_SCRIPT');
    expect(homeClient).toContain('CMD_CONSOLE_MAX_LINES');
    expect(homeClient).toContain('CMD_CONSOLE_MAX_LINES = 16');
    expect(homeClient).toContain('matchMedia(\'(prefers-reduced-motion: reduce)\')');
    expect(homeClient).toContain('window.setTimeout');
    expect(homeClient).toContain('window.clearTimeout');
    expect(homeClient).toContain('cmd-console__line__caret');
    expect(homeClient).toContain('cmd-console__line--out--ok');
    expect(homeClient).toContain('cmd-console__line--out--info');
  });

  it('maps the New chat button to the v3 ghost subtle variant', () => {
    expect(uiCss).toMatch(/\.m-sb__new\s*\{[\s\S]*?background:\s*var\(--surface\);[\s\S]*?border:\s*1px solid var\(--border-default\);[\s\S]*?color:\s*var\(--text-primary\);/);
    expect(uiCss).toMatch(/\.m-sb__new svg\s*\{[\s\S]*?color:\s*var\(--b-500\);/);
    expect(uiCss).toMatch(/html\[data-theme='dark'\]\s+\.m-sb__new svg\s*\{[\s\S]*?color:\s*var\(--info-fg\);/);
    expect(uiCss).toMatch(/\.m-sb__new:hover\s*\{[\s\S]*?background:\s*var\(--surface-hover\);[\s\S]*?border-color:\s*var\(--b-300\);[\s\S]*?color:\s*var\(--b-700\);/);
    expect(uiCss).toMatch(/html\[data-theme='dark'\]\s+\.m-sb__new:hover\s*\{[\s\S]*?color:\s*var\(--info-fg\);[\s\S]*?border-color:\s*var\(--info-fg\);/);
  });

  it('adds v3 hover motion and disables transforms for reduced motion', () => {
    expect(uiCss).toMatch(/\.m-sb__nav-item:hover\s*\{[\s\S]*?transform:\s*translateX\(2px\);/);
    expect(uiCss).toMatch(/\.m-sb__proj:hover\s*\{[\s\S]*?transform:\s*translateX\(2px\);/);
    expect(uiCss).toMatch(/\.home-proj:hover\s*\{[\s\S]*?transform:\s*translateY\(-2px\);/);
    expect(uiCss).toMatch(/\.proj-list-card:hover:not\(\.proj-list-card--new\)\s*\{[\s\S]*?transform:\s*translateY\(-2px\);/);
    expect(uiCss).toMatch(/\.ask-recent-item:hover\s*\{[\s\S]*?transform:\s*translateX\(2px\);/);
    expect(uiCss).toMatch(/\.ask-sug:hover\s*\{[\s\S]*?transform:\s*translateY\(-1px\);/);
    expect(uiCss).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?\.home-proj:hover,[\s\S]*?transform:\s*none;/);
  });

  it('keeps ambient layers out of content stacking and adds cursor spotlight', () => {
    expect(uiCss).toContain('.m-body > .cmd-console { z-index: 0; }');
    expect(uiCss).toContain('.m-body > *:not(.cmd-stream):not(.home-orb):not(.cmd-console):not(.home-acronym)');
    expect(uiCss).toContain('.m-body:has(.home-orb) > *:not(.home-orb):not(.cmd-console):not(.home-acronym):not(.cmd-stream)');
    expect(uiCss).toMatch(/\.cmd-console\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?opacity:\s*0\.55;[\s\S]*?pointer-events:\s*none;/);
    expect(uiCss).toMatch(/\.cmd-console__viewport\s*\{[\s\S]*?bottom:\s*var\(--sp-12\);/);
    expect(uiCss).toMatch(/html\[data-theme='dark'\]\s+\.cmd-console\s*\{[\s\S]*?opacity:\s*0\.65;/);
    expect(uiCss).toMatch(/\.m-body::after\s*\{[\s\S]*?radial-gradient\(280px 280px at var\(--mx\) var\(--my\)/);
    expect(homeClient).toContain('mBodyRef');
    expect(homeClient).toContain('--mx');
    expect(homeClient).toContain('--my');
  });

  it('keeps the mobile command console ambient instead of covering hero text', () => {
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.cmd-console\s*\{[\s\S]*?left:\s*0;[\s\S]*?transform:\s*none;[\s\S]*?height:\s*112px;[\s\S]*?opacity:\s*0\.34;/);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.cmd-console__viewport\s*\{[\s\S]*?align-items:\s*flex-end;/);
    expect(uiCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.cmd-console__line\s*\{[\s\S]*?max-width:\s*min\(72vw,\s*280px\);[\s\S]*?font-size:\s*11\.5px;/);
  });
});
