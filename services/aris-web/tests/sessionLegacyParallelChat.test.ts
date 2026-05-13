import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterface = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx'), 'utf8');

describe('legacy session parallel chat surface', () => {
  it('removes the iframe-based left/right parallel chat model from the legacy session route', () => {
    expect(chatInterface).not.toContain('type ParallelChatSide');
    expect(chatInterface).not.toContain('type ParallelChatLayout');
    expect(chatInterface).not.toContain('parallelChatLayout');
    expect(chatInterface).not.toContain('leftChatId');
    expect(chatInterface).not.toContain('rightChatId');
    expect(chatInterface).not.toContain('parallelChatFrameContent');
    expect(chatInterface).not.toContain('surfaceMode === \'full\' && parallelChatLayout');
  });
});
