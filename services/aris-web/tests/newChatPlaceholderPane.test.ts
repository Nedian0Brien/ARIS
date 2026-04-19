import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfacePath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx');
const workspaceHomePanePath = resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/WorkspaceHomePane.tsx');
const newChatPlaceholderPanePath = resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/NewChatPlaceholderPane.tsx');

const chatInterfaceSource = readFileSync(chatInterfacePath, 'utf8');
const workspaceHomePaneSource = readFileSync(workspaceHomePanePath, 'utf8');
const newChatPlaceholderPaneSource = readFileSync(newChatPlaceholderPanePath, 'utf8');

describe('chat center branch extraction seams', () => {
  it('wires ChatInterface through the extracted workspace home and placeholder panes', () => {
    expect(chatInterfaceSource).toContain('<WorkspaceHomePane');
    expect(chatInterfaceSource).toContain('<NewChatPlaceholderPane');
  });

  it('keeps the workspace home stream wrapper behavior inside WorkspaceHomePane', () => {
    expect(workspaceHomePaneSource).toContain("className={`${styles.stream} ${isMobileLayout ? styles.streamMobileScroll : ''} ${chatEntryPendingRevealClassName}`}");
    expect(workspaceHomePaneSource).toContain('aria-hidden={showChatTransitionLoading}');
    expect(workspaceHomePaneSource).toContain('<WorkspaceHome');
  });

  it('keeps the new chat placeholder wrapper and agent selector mapping intact', () => {
    expect(newChatPlaceholderPaneSource).toContain("className={`${styles.stream} ${isMobileLayout ? styles.streamMobileScroll : ''} ${chatEntryPendingRevealClassName}`}");
    expect(newChatPlaceholderPaneSource).toContain('aria-hidden={showChatTransitionLoading}');
    expect(newChatPlaceholderPaneSource).toContain('CHAT_AGENT_CHOICES.map((choice) => {');
    expect(newChatPlaceholderPaneSource).toContain('resolveAgentSubtitle(choice)');
    expect(newChatPlaceholderPaneSource).toContain('onClick={() => void onCreateChat(choice)}');
  });
});
