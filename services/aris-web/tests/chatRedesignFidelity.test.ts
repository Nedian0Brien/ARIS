import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatCss = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css'), 'utf8');
const pagerShell = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/WorkspacePagerShell.tsx'), 'utf8');
const chatInterface = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx'), 'utf8');
const sidebarPane = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/left-sidebar/ChatSidebarPane.tsx'), 'utf8');
const sidebarItem = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/left-sidebar/ChatSidebarItem.tsx'), 'utf8');
const timeline = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/ChatTimeline.tsx'), 'utf8');
const composer = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/ChatComposer.tsx'), 'utf8');

describe('chat redesign fidelity', () => {
  it('uses the prototype desktop shell with chat and a persistent 420px workspace pane', () => {
    expect(pagerShell).toContain('centerPanelChat');
    expect(pagerShell).toContain('centerPanelWorkspace');
    expect(chatCss).toMatch(/\.centerPanel\s*\{[\s\S]*display:\s*grid;[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s*420px;/);
    expect(chatCss).toMatch(/\.centerPanelWorkspace\s*\{[\s\S]*width:\s*420px;[\s\S]*border-left:\s*1px solid var\(--border-subtle\);/);
    expect(chatInterface).toContain("!isMobileLayout || activeWorkspacePageId === 'chat'");
  });

  it('rebuilds the sidebar as a branded session surface with search, status dots, and hover detail', () => {
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
    expect(timeline).toContain('messageBubbleUser');
    expect(timeline).toContain('messageBubbleAgent');
    expect(chatCss).toMatch(/\.messageRow\s*\{[\s\S]*width:\s*min\(100%,\s*780px\);[\s\S]*margin-inline:\s*auto;/);
    expect(chatCss).toMatch(/\.messageBubbleAgent\s*\{[\s\S]*background:\s*transparent;[\s\S]*border-color:\s*transparent;[\s\S]*box-shadow:\s*none;/);
  });

  it('keeps composer v2 visually faithful with mode-filled pills, round send button, and shortcut placeholder', () => {
    expect(composer).toContain('Shift ↵ 줄바꿈 · ⌘ ↵ 전송');
    expect(chatCss).toMatch(/\.composerModeToggle\s*\{[\s\S]*border-radius:\s*var\(--r-full\);/);
    expect(chatCss).toMatch(/\.composerModePillActive\s*\{[\s\S]*background:\s*var\(--composer-accent\);[\s\S]*color:\s*#fff;/);
    expect(chatCss).toMatch(/\.composerSendBtn\s*\{[\s\S]*border-radius:\s*var\(--r-full\);/);
  });
});
