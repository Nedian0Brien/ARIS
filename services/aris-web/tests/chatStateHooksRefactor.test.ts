import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfacePath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx');
const chatInterfaceSource = readFileSync(chatInterfacePath, 'utf8');

describe('chat screen state hook refactor', () => {
  it('routes ChatInterface state through the extracted domain hooks', () => {
    expect(chatInterfaceSource).toContain("from './chat-screen/hooks/useChatRuntimeUi'");
    expect(chatInterfaceSource).toContain("from './chat-screen/hooks/useChatSidebarState'");
    expect(chatInterfaceSource).toContain("from './chat-screen/hooks/useComposerState'");
    expect(chatInterfaceSource).toContain("from './chat-screen/hooks/useWorkspaceBrowserState'");
    expect(chatInterfaceSource).toContain("from './chat-screen/hooks/useChatLayoutState'");
    expect(chatInterfaceSource).toContain("from './chat-screen/hooks/useChatScreenState'");
  });
});
