import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatCss = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css'), 'utf8');
const sessionPage = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/page.tsx'), 'utf8');
const pagerShell = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/WorkspacePagerShell.tsx'), 'utf8');
const chatInterface = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx'), 'utf8');
const sidebarPane = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/left-sidebar/ChatSidebarPane.tsx'), 'utf8');
const sidebarItem = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/left-sidebar/ChatSidebarItem.tsx'), 'utf8');
const timeline = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/ChatTimeline.tsx'), 'utf8');
const composer = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/ChatComposer.tsx'), 'utf8');
const chatHeader = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/ChatHeader.tsx'), 'utf8');
const workspacePane = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/right-pane/WorkspacePanelsPane.tsx'), 'utf8');

describe('chat redesign fidelity', () => {
  it('renders the chat route as the prototype shell, not inside the legacy global app header', () => {
    expect(sessionPage).not.toContain('<Header userEmail');
    expect(sessionPage).not.toContain("paddingTop: '64px'");
    expect(sessionPage).toContain('app-shell-chat-screen');
    expect(chatInterface).toContain('chatShellPrototype');
    expect(chatCss).toMatch(/\.chatShellPrototype\s*\{[\s\S]*grid-template-columns:\s*264px minmax\(0,\s*1fr\);[\s\S]*height:\s*100dvh;/);
  });

  it('uses the prototype desktop shell with chat and a persistent 420px workspace pane', () => {
    expect(pagerShell).toContain('centerPanelChat');
    expect(pagerShell).toContain('centerPanelWorkspace');
    expect(pagerShell).toContain('styles.csMain');
    expect(pagerShell).toContain('styles.wsPane');
    expect(chatCss).toMatch(/\.centerPanel\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*420px;/);
    expect(chatCss).toMatch(/\.centerPanelWorkspace\s*\{[\s\S]*width:\s*420px;[\s\S]*border-left:\s*1px solid var\(--border-subtle\);/);
    expect(chatInterface).toContain("!isMobileLayout || activeWorkspacePageId === 'chat'");
  });

  it('rebuilds the sidebar as a branded session surface with search, status dots, and hover detail', () => {
    expect(sidebarPane).toContain('styles.csSidebar');
    expect(sidebarPane).toContain('styles.csSidebarTop');
    expect(sidebarPane).toContain('styles.csSidebarLogo');
    expect(sidebarPane).toContain('styles.csSidebarNewchat');
    expect(sidebarPane).toContain('styles.csSidebarSearch');
    expect(sidebarItem).toContain('styles.csSession');
    expect(sidebarItem).toContain('styles.csSessionActive');
    expect(sidebarItem).toContain('styles.csSessionTitle');
    expect(sidebarItem).toContain('styles.csSessionMeta');
    expect(sidebarItem).toContain('styles.csSessionDot');
    expect(sidebarPane).toContain('chatSidebarBrandMark');
    expect(sidebarPane).toContain('chatSidebarWordmark');
    expect(sidebarPane).toContain('chatSidebarSearchInput');
    expect(sidebarPane).toContain('filteredSections');
    expect(sidebarItem).toContain('chatListStatusDot');
    expect(sidebarItem).toContain('chatListTooltip');
    expect(sidebarItem).toContain('role="tooltip"');
    expect(chatCss).toContain('.chatListStatusDot.chatListItemStateRunning');
    expect(chatCss).toContain('.chatListTooltip');
  });

  it('matches the prototype timeline rule: centered 780px content, user bubbles only, agent body unboxed', () => {
    expect(chatHeader).toContain('styles.csHeader');
    expect(chatHeader).toContain('styles.csHeaderLeft');
    expect(chatHeader).toContain('styles.csHeaderRight');
    expect(timeline).toContain('styles.csTimeline');
    expect(timeline).toContain('styles.csTimelineInner');
    expect(timeline).toContain('styles.csMsgUser');
    expect(timeline).toContain('styles.csMsgAgent');
    expect(timeline).toContain('messageBubbleUser');
    expect(timeline).toContain('messageBubbleAgent');
    expect(chatCss).toMatch(/\.csTimelineInner\s*\{[\s\S]*max-width:\s*780px;[\s\S]*margin:\s*0 auto;/);
    expect(chatCss).toMatch(/\.messageBubbleAgent\s*\{[\s\S]*background:\s*transparent;[\s\S]*border-color:\s*transparent;[\s\S]*box-shadow:\s*none;/);
  });

  it('keeps composer v2 visually faithful with mode-filled pills, round send button, and shortcut placeholder', () => {
    expect(composer).toContain('styles.compV2');
    expect(composer).toContain('styles.compV2Top');
    expect(composer).toContain('styles.compV2Area');
    expect(composer).toContain('styles.compV2Input');
    expect(composer).toContain('styles.compV2Bar');
    expect(composer).toContain('styles.compV2Tools');
    expect(composer).toContain('styles.compV2Send');
    expect(composer).toContain('Shift ↵ 줄바꿈 · ⌘ ↵ 전송');
    expect(chatCss).toMatch(/\.compV2\s*\{[\s\S]*max-width:\s*780px;[\s\S]*border-radius:\s*14px;/);
    expect(chatCss).toMatch(/\.compV2Top\s*\{[\s\S]*padding:\s*8px 10px;[\s\S]*border-bottom:\s*1px solid var\(--border-subtle\);/);
    expect(chatCss).toMatch(/\.compV2Send\s*\{[\s\S]*height:\s*30px;[\s\S]*border-radius:\s*var\(--r-full\);/);
  });

  it('maps the workspace sidecar to the prototype ws-pane taxonomy', () => {
    expect(workspacePane).toContain('styles.wsPaneHeader');
    expect(workspacePane).toContain('styles.wsTabs');
    expect(workspacePane).toContain('styles.wsTab');
    expect(workspacePane).toContain('styles.wsTabActive');
    expect(workspacePane).toContain('styles.wsBody');
    expect(workspacePane).toContain('styles.wsCard');
    expect(workspacePane).toContain('styles.wsRunStep');
    expect(chatCss).toMatch(/\.wsPane\s*\{[\s\S]*background:\s*var\(--surface\);[\s\S]*border-left:\s*1px solid var\(--border-subtle\);/);
    expect(chatCss).toMatch(/\.wsTabs\s*\{[\s\S]*border-bottom:\s*1px solid var\(--border-subtle\);/);
  });
});
