import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const homeClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');
const uiCss = readFileSync(resolve(__dirname, '../app/styles/ui.css'), 'utf8');

function cssBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = uiCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] ?? '';
}

describe('project parallel chat drag surface', () => {
  it('renders split panels in-process instead of embedding the app in iframes', () => {
    expect(homeClient).toContain('function ProjectParallelChatPane({');
    expect(homeClient).toContain('<ProjectParallelChatPane');
    expect(homeClient).toContain('fetch(withAppBasePath(`/api/runtime/sessions/${encodeURIComponent(session.id)}/events?${params.toString()}`)');
    expect(homeClient).not.toContain('className="pc-parallel__iframe"');
    expect(homeClient).not.toContain('<iframe');
    expect(homeClient).not.toContain('/api/parallel-workspaces');
  });

  it('makes project sidebar chat children draggable', () => {
    expect(homeClient).toContain("const PROJECT_CHAT_DRAG_MIME = 'application/x-aris-project-chat';");
    expect(homeClient).toContain("const PROJECT_CHAT_DRAG_JSON_MIME = 'application/json';");
    expect(homeClient).toContain('onProjectChatDragStart(event, session.id, chat)');
    expect(homeClient).toContain('onProjectChatDragEnd={handleProjectChatDragEnd}');
    expect(homeClient).toContain('writeProjectChatDragPayload(event, sessionId, chat)');
    expect(homeClient).toContain("event.dataTransfer.setData('text/plain', payload);");
    expect(homeClient).toContain('className={`m-sb__chat-child${activeProjectChatId === chat.id ?');
  });

  it('renders drop zones and direct project chat panels inside ProjectChatSurface', () => {
    expect(homeClient).toContain('ProjectParallelDropOverlay');
    expect(homeClient).toContain('ProjectParallelPanelTree');
    expect(homeClient).toContain('handleProjectParallelPanelDrop');
    expect(homeClient).toContain('onDragOver={handleProjectParallelSurfaceDragOver}');
    expect(homeClient).toContain('onDrop={handleProjectParallelSurfaceDrop}');
    expect(homeClient).toContain('resolveProjectParallelDropEdge(event)');
    expect(homeClient).toContain('computeProjectPanelDropEdge(event.clientX, event.clientY, rect)');
    expect(homeClient).toContain('function ProjectChatComposer({');
    expect(homeClient).toContain('<ProjectChatComposer');
    expect(homeClient).not.toContain('className="pc-parallel-chat__composer"');
    expect(uiCss).toContain('.pc-parallel-chat__timeline');
    expect(uiCss).toContain('.pc-proto .pc-parallel .cmp-wrap');
  });

  it('persists project panel layout per project session', () => {
    expect(homeClient).toContain('createProjectPanelLayoutStorageKey(session.id)');
    expect(homeClient).toContain('parseProjectPanelState(');
    expect(homeClient).toContain('serializeProjectPanelState(parallelPanelState)');
    expect(homeClient).toContain('readLocalStorage(parallelLayoutStorageKey)');
    expect(homeClient).toContain('writeLocalStorage(parallelLayoutStorageKey');
    expect(homeClient).toContain('removeLocalStorage(parallelLayoutStorageKey)');
  });

  it('supports compact project panel mode instead of the legacy session screen', () => {
    expect(homeClient).toContain("type ProjectChatSurfaceMode = 'full' | 'panel';");
    expect(homeClient).toContain("searchParams.get('surface') === 'panel' ? 'panel' : 'full'");
    expect(homeClient).toContain("app-shell-ia--project-panel");
    expect(uiCss).toContain('.app-shell-ia--project-panel .m-sb');
    expect(uiCss).toContain('.pc-proto[data-surface="panel"]');
  });

  it('keeps the project parallel layout responsive', () => {
    expect(uiCss).toContain('.pc-parallel__frames');
    expect(uiCss).toContain('.pc-parallel__split[data-direction="horizontal"]');
    expect(uiCss).toContain('flex-direction: row;');
    expect(uiCss).toContain('.pc-parallel__split[data-direction="vertical"]');
    expect(uiCss).toContain('flex-direction: column;');
    expect(uiCss).toContain('.pc-parallel__divider');
  });

  it('makes the split chat layout fill the project chat viewport instead of leaving blank space under the composer', () => {
    const splitChatViewportBlock = cssBlock('.m-main-scroll--project-chat-detail .pc-proto .pc-parallel');
    expect(splitChatViewportBlock).toContain('height: 100%;');
    expect(splitChatViewportBlock).toContain('min-height: 0;');
    expect(cssBlock('.pc-proto .pc-parallel .cmp-wrap')).toContain('padding: var(--sp-4);');
    expect(cssBlock('.pc-proto .pc-parallel .cmp__input')).toContain('min-height: 48px;');
    expect(cssBlock('.pc-proto .pc-parallel .cmp__input')).toContain('max-height: 140px;');
  });
});
