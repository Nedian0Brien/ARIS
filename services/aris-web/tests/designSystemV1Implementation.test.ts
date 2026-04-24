import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const tokensCss = readFileSync(resolve(__dirname, '../app/styles/tokens.css'), 'utf8');
const homeClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');
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
