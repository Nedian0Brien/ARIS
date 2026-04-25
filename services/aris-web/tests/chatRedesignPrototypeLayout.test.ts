import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const chatInterfaceCss = readFileSync('app/sessions/[sessionId]/ChatInterface.module.css', 'utf8');
const workspacePagerCss = readFileSync('app/sessions/[sessionId]/workspace-panels/WorkspacePager.module.css', 'utf8');
const tokensCss = readFileSync('app/styles/tokens.css', 'utf8');

describe('chat redesign prototype layout', () => {
  it('exposes design-system-v1 primitives to the real web app', () => {
    expect(tokensCss).toContain('--n-950: #07080c;');
    expect(tokensCss).toContain('--b-500: #2f6bff;');
    expect(tokensCss).toContain('--mode-agent-bg: var(--b-50);');
    expect(tokensCss).toContain('--mode-terminal-bg: #e7f7ee;');
  });

  it('keeps the prototype sidebar, tooltip, and composer v2 surfaces in CSS', () => {
    expect(chatInterfaceCss).toContain('.chatSidebarBrand');
    expect(chatInterfaceCss).toContain('.chatSidebarSearch');
    expect(chatInterfaceCss).toContain('.chatListTooltip');
    expect(chatInterfaceCss).toContain('.composerTopRow');
    expect(chatInterfaceCss).toContain('.modeToggle');
    expect(chatInterfaceCss).toContain('.composerCardTerminal');
  });

  it('shows desktop workspace pages as a right column beside chat', () => {
    expect(workspacePagerCss).toContain("@media (min-width: 1200px)");
    expect(workspacePagerCss).toContain("grid-template-columns: minmax(0, 1fr) minmax(360px, 420px);");
    expect(workspacePagerCss).toContain(".pageHidden:not([data-workspace-page-kind='chat'])");
  });
});
