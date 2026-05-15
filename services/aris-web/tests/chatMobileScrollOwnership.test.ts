import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfacePath = resolve(__dirname, '../app/_legacy/sessions/[sessionId]/ChatInterface.tsx');
const chatTailRestorePath = resolve(__dirname, '../app/_legacy/sessions/[sessionId]/useChatTailRestore.ts');
const chatInterfaceCssPath = resolve(__dirname, '../app/_legacy/sessions/[sessionId]/ChatInterface.module.css');

const chatInterfaceSource = readFileSync(chatInterfacePath, 'utf8');
const chatTailRestoreSource = readFileSync(chatTailRestorePath, 'utf8');
const chatInterfaceCss = readFileSync(chatInterfaceCssPath, 'utf8');

function readCssBlock(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? '';
}

describe('chat mobile scroll ownership', () => {
  it('keeps the mobile chat shell and timeline on the page-scroll model', () => {
    const chatShellMobileScroll = readCssBlock(chatInterfaceCss, '.chatShell.chatShellMobileScroll');
    const centerPanelMobileScroll = readCssBlock(chatInterfaceCss, '.centerPanel.centerPanelMobileScroll');
    const centerFrameMobileScroll = readCssBlock(chatInterfaceCss, '.centerFrame.centerFrameMobileScroll');
    const streamMobileScroll = readCssBlock(chatInterfaceCss, '.stream.streamMobileScroll');

    expect(chatShellMobileScroll).toContain('overflow: visible;');
    expect(centerPanelMobileScroll).toContain('overflow: hidden;');
    expect(centerFrameMobileScroll).toContain('overflow: hidden;');
    expect(streamMobileScroll).toContain('overflow: visible;');
    expect(streamMobileScroll).not.toContain('overflow-y: auto;');
  });

  it('drives mobile chat tail restore through the page scroll owner', () => {
    expect(chatTailRestoreSource).toContain("source: 'tail:scrollConversationToBottom:window'");
    expect(chatTailRestoreSource).toContain('window.scrollTo(');
  });

  it('uses mobile window-scroll reads for bottom state and top history pagination', () => {
    expect(chatInterfaceSource).toContain('getWindowScrollTop()');
    expect(chatInterfaceSource).toContain('isNearWindowBottom()');
    expect(chatInterfaceSource).toContain('history:loadOlder:window-threshold');
  });
});
