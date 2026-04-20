import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfaceTsxPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx');
const chatTimelineTsxPath = resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/center-pane/ChatTimeline.tsx');

const chatInterfaceTsx = readFileSync(chatInterfaceTsxPath, 'utf8');
const chatTimelineTsx = readFileSync(chatTimelineTsxPath, 'utf8');

describe('chat history loading mode', () => {
  it('forwards a manual load handler into the chat timeline', () => {
    expect(chatInterfaceTsx).toContain('hasMoreBefore={hasMoreBefore}');
    expect(chatInterfaceTsx).toContain('isLoadingOlder={isLoadingOlder}');
    expect(chatInterfaceTsx).toContain('onLoadOlder={handleLoadOlderButtonClick}');
  });

  it('does not auto-load older pages from scroll threshold listeners', () => {
    expect(chatInterfaceTsx).not.toContain('history:loadOlder:window-threshold');
    expect(chatInterfaceTsx).not.toContain('history:loadOlder:stream-threshold');
  });

  it('renders the manual history load button from the timeline component', () => {
    expect(chatTimelineTsx).toContain('aria-label="이전 메시지 더 불러오기"');
    expect(chatTimelineTsx).toContain('이전 메시지 더 불러오기');
  });
});
