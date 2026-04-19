import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfaceTsxPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx');
const chatComposerTsxPath = resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/ChatComposer.tsx');
const chatInterfaceCssPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css');

const chatInterfaceTsx = readFileSync(chatInterfaceTsxPath, 'utf8');
const chatComposerTsx = readFileSync(chatComposerTsxPath, 'utf8');
const chatInterfaceCss = readFileSync(chatInterfaceCssPath, 'utf8');

describe('chat entry loading visibility guards', () => {
  it('keeps the chat stream hidden while entry loading is active', () => {
    expect(chatInterfaceTsx).toMatch(/showChatTransitionLoading \? styles\.chatEntryPendingReveal : ''/);
    expect(chatInterfaceCss).toMatch(/\.chatEntryPendingReveal\s*\{[\s\S]*visibility:\s*hidden;/);
  });

  it('keeps the composer hidden until the pending reveal finishes', () => {
    expect(chatComposerTsx).toMatch(/className=\{`\$\{styles\.composerDock\} \$\{showPendingReveal \? styles\.chatEntryPendingReveal : ''\}`\}/);
    expect(chatInterfaceTsx).toContain('showPendingReveal={showChatTransitionLoading}');
  });

  it('shows the scroll-to-bottom affordance only on the active chat timeline', () => {
    expect(chatInterfaceTsx).toContain('!showChatTransitionLoading && activeChatIdResolved && !isWorkspaceHome && !isNewChatPlaceholder && showScrollToBottom');
  });
});
