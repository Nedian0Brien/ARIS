import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterface = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx'), 'utf8');
const chatInterfaceCss = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css'), 'utf8');
const chatSidebarItem = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/left-sidebar/ChatSidebarItem.tsx'), 'utf8');
const chatSidebarPane = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/chat-screen/left-sidebar/ChatSidebarPane.tsx'), 'utf8');
const sessionPage = readFileSync(resolve(__dirname, '../app/sessions/[sessionId]/page.tsx'), 'utf8');
const sessionSyncLeader = readFileSync(resolve(__dirname, '../lib/hooks/useSessionSyncLeader.ts'), 'utf8');

describe('parallel chat drag surface', () => {
  it('makes left sidebar chat rows draggable and forwards drag lifecycle callbacks', () => {
    expect(chatSidebarItem).toContain('draggable={!item.isRenaming}');
    expect(chatSidebarItem).toContain('onDragStart={(event) => onChatDragStart?.(event, item)}');
    expect(chatSidebarItem).toContain('onDragEnd={onChatDragEnd}');
    expect(chatSidebarPane).toContain('onChatDragStart={onChatDragStart}');
    expect(chatSidebarPane).toContain('onChatDragEnd={onChatDragEnd}');
  });

  it('renders left and right drop zones in the existing session surface', () => {
    expect(chatInterface).toContain("const CHAT_DRAG_MIME = 'application/x-aris-chat-id';");
    expect(chatInterface).toContain('handleParallelDrop');
    expect(chatInterface).toContain('parallelChatDropZone');
    expect(chatInterface).toContain('왼쪽에 놓기');
    expect(chatInterface).toContain('오른쪽에 놓기');
    expect(chatInterface).not.toContain('/api/parallel-workspaces');
  });

  it('opens compact session panels with proxy-safe panel URLs', () => {
    expect(chatInterface).toContain("surface: 'panel'");
    expect(chatInterface).toContain('withAppBasePath(`/sessions/${encodeURIComponent(sessionId)}?${params.toString()}`)');
    expect(chatInterface).toContain('className={styles.parallelChatFrameContent}');
    expect(sessionPage).toContain("const surfaceMode = resolvedSearchParams?.surface === 'panel' ? 'parallel-panel' : 'full';");
  });

  it('scopes sync leadership per chat in compact panels', () => {
    expect(chatInterface).toContain("const sessionSyncScopeKey = surfaceMode === 'parallel-panel' ? activeChatIdResolved : null;");
    expect(chatInterface).toContain('useSessionSyncLeader(sessionId, sessionSyncScopeKey)');
    expect(sessionSyncLeader).toContain('scopeKey: string | null = null');
    expect(sessionSyncLeader).toContain('`aris:session-sync-leader:${sessionId}:${normalizedScopeKey}`');
  });

  it('keeps the split layout responsive without desktop-only widths', () => {
    expect(chatInterfaceCss).toContain('.parallelChatFrames');
    expect(chatInterfaceCss).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(chatInterfaceCss).toContain('@media (min-width: 768px)');
    expect(chatInterfaceCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });
});
