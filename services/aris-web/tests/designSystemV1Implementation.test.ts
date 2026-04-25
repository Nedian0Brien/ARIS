import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(resolve(__dirname, '../app/styles/tokens.css'), 'utf8');
const homeClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');
const uiCss = readFileSync(resolve(__dirname, '../app/styles/ui.css'), 'utf8');
const header = readFileSync(resolve(__dirname, '../components/layout/Header.tsx'), 'utf8');
const bottomNav = readFileSync(resolve(__dirname, '../components/layout/BottomNav.tsx'), 'utf8');
const chatComposer = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/ChatComposer.tsx'), 'utf8');
const chatCss = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css'), 'utf8');

describe('ARIS design-system-v1 implementation', () => {
  it('uses design-system-v1 refined blue, cool neutral, and surface role tokens', () => {
    expect(tokensCss).toContain('--n-50: #F7F8FA;');
    expect(tokensCss).toContain('--n-950: #07080C;');
    expect(tokensCss).toContain('--b-500: #2F6BFF;');
    expect(tokensCss).toContain('--surface-elevated: #FFFFFF;');
    expect(tokensCss).toContain('--text-primary: var(--n-900);');
    expect(tokensCss).toContain('--r-xl: 12px;');
    expect(tokensCss).toContain('--dur-normal: 180ms;');
  });

  it('maps the primary shell IA to Home, Ask ARIS, Project, and Files', () => {
    expect(homeClient).toContain("'home'");
    expect(homeClient).toContain("'ask'");
    expect(homeClient).toContain("'project'");
    expect(homeClient).toContain("'files'");
    expect(header).toContain('Home');
    expect(header).toContain('Ask ARIS');
    expect(header).toContain('Project');
    expect(header).toContain('Files');
    expect(bottomNav).toContain('Home');
    expect(bottomNav).toContain('Ask');
    expect(bottomNav).toContain('Project');
    expect(bottomNav).toContain('Files');
  });

  it('implements the IA v2 shell structure instead of relabeling the old dashboard', () => {
    [
      'className="aris-ia-shell"',
      'className="m-sb"',
      'className="m-top"',
      'className="m-top__right"',
      'className="m-theme-toggle"',
      'className="home-orb"',
      'className="home-strip"',
      'className="home-proj__chats"',
      'className="ask-search"',
      'className="ask-sug"',
      'className="proj-head"',
      'className="proj-docs"',
      'className="proj-tabs"',
      'className="files-body"',
      'className="files-preview"',
    ].forEach((classFragment) => {
      expect(homeClient).toContain(classFragment);
    });

    [
      '.aris-ia-shell',
      '.m-sb',
      '.m-top',
      '.m-theme-toggle',
      '.m-theme-toggle__item--active',
      '.home-orb',
      '.home-strip',
      '.home-proj__chats',
      '.ask-search',
      '.proj-head',
      '.proj-docs',
      '.files-body',
      '.files-preview',
    ].forEach((selector) => {
      expect(uiCss).toContain(selector);
    });

    expect(homeClient).not.toContain('SessionDashboard');
    expect(homeClient).not.toContain('FileExplorer');
    expect(homeClient).not.toContain("from '@/components/layout/Header'");
  });

  it('keeps the IA v2 topbar theme control wired to system, light, and dark modes', () => {
    expect(homeClient).toContain('readThemeMode');
    expect(homeClient).toContain('applyTheme');
    expect(homeClient).toContain("'system' as const");
    expect(homeClient).toContain("'light' as const");
    expect(homeClient).toContain("'dark' as const");
    expect(homeClient).toContain('시스템');
    expect(homeClient).toContain('라이트');
    expect(homeClient).toContain('다크');
    expect(homeClient).toContain("aria-label=\"테마 선택\"");
    expect(homeClient).not.toContain('More actions');
  });

  it('restores the IA v2 animated home orb as a Three.js dot-globe background', () => {
    expect(homeClient).toContain('data-orb-scene="dot-globe"');
    expect(homeClient).toContain("import('three')");
    expect(homeClient).toContain('new THREE.Points');
    expect(homeClient).toContain('new THREE.BufferGeometry');
    expect(homeClient).toContain('requestAnimationFrame');
    expect(homeClient).toContain('prefers-reduced-motion: reduce');
    expect(homeClient).toContain('const orbRadiusRatio = 0.42');
    expect(homeClient).toContain('const dotRadiusBase = 0.5');
    expect(homeClient).toContain('const dotRadiusDepth = 1.7');
    expect(homeClient).toContain('* 2.0 * uPixelRatio');
    expect(uiCss).toContain('right: -80px;');
    expect(uiCss).toContain('width: 420px;');
    expect(uiCss).toContain('mix-blend-mode: screen;');
  });

  it('keeps the IA v2 desktop sidebar and main panel on separate scroll owners', () => {
    expect(uiCss).toMatch(/@media\s*\(min-width:\s*768px\)\s*\{[\s\S]*?\.app-shell-ia\s*\{[^}]*height:\s*var\(--app-vh,\s*100dvh\);[^}]*overflow:\s*hidden;/s);
    expect(uiCss).toMatch(/@media\s*\(min-width:\s*768px\)\s*\{[\s\S]*?\.aris-ia-shell\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(uiCss).toMatch(/@media\s*\(min-width:\s*768px\)\s*\{[\s\S]*?\.m-main\s*\{[^}]*height:\s*100%;[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s);
    expect(uiCss).toMatch(/\.m-sb\s*\{[^}]*height:\s*var\(--app-vh,\s*100dvh\);[^}]*overflow-y:\s*auto;/s);
    expect(uiCss).toMatch(/\.m-body,\s*[\r\n]+\.m-main-scroll\s*\{[^}]*min-height:\s*0;[^}]*overflow-y:\s*auto;/s);
  });

  it('implements composer v2 Agent, Plan, and Terminal modes in the chat composer surface', () => {
    expect(chatComposer).toContain('Agent');
    expect(chatComposer).toContain('Plan');
    expect(chatComposer).toContain('Terminal');
    expect(chatComposer).toContain('composerModeToggle');
    expect(chatComposer).toContain('composerModePlan');
    expect(chatComposer).toContain('composerModeTerminal');
    expect(chatCss).toContain('.composerModeToggle');
    expect(chatCss).toContain('.composerModePlan');
    expect(chatCss).toContain('.composerModeTerminal');
  });
});
