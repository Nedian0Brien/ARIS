import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfacePath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx');
const chatTailRestorePath = resolve(__dirname, '../app/sessions/[sessionId]/useChatTailRestore.ts');
const chatInterfaceCssPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css');

const chatInterfaceSource = readFileSync(chatInterfacePath, 'utf8');
const chatTailRestoreSource = readFileSync(chatTailRestorePath, 'utf8');
const chatInterfaceCss = readFileSync(chatInterfaceCssPath, 'utf8');

function readCssBlock(source: string, selector: string): string {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escapedSelector}\\s*\\{([\\s\\S]*?)\\n\\}`));
  return match?.[1] ?? '';
}

describe('chat mobile scroll ownership', () => {
  it('keeps the mobile chat shell and timeline as contained scroll regions', () => {
    const chatShellMobileScroll = readCssBlock(chatInterfaceCss, '.chatShell.chatShellMobileScroll');
    const centerPanelMobileScroll = readCssBlock(chatInterfaceCss, '.centerPanel.centerPanelMobileScroll');
    const centerFrameMobileScroll = readCssBlock(chatInterfaceCss, '.centerFrame.centerFrameMobileScroll');
    const streamMobileScroll = readCssBlock(chatInterfaceCss, '.stream.streamMobileScroll');

    expect(chatShellMobileScroll).toContain('overflow: hidden;');
    expect(centerPanelMobileScroll).toContain('overflow: hidden;');
    expect(centerFrameMobileScroll).toContain('overflow: hidden;');
    expect(streamMobileScroll).toContain('overflow-y: auto;');
    expect(streamMobileScroll).not.toContain('overflow: visible;');
  });

  it('drives chat tail restore through the stream instead of window scroll writes', () => {
    expect(chatTailRestoreSource).toContain("source: 'tail:scrollConversationToBottom:stream'");
    expect(chatTailRestoreSource).not.toContain('window.scrollTo(');
  });

  it('avoids mobile window-scroll reads in the chat interface scroll sync path', () => {
    expect(chatInterfaceSource).not.toContain('getWindowScrollTop()');
    expect(chatInterfaceSource).not.toContain('isNearWindowBottom()');
  });
});
