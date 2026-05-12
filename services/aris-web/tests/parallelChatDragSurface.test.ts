import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const homeClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');
const uiCss = readFileSync(resolve(__dirname, '../app/styles/ui.css'), 'utf8');

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
    expect(homeClient).toContain('pc-parallel-dropzones');
    expect(homeClient).toContain('pc-parallel-dropzone');
    expect(homeClient).toContain('handleProjectParallelDrop');
    expect(homeClient).toContain('onDragOver={handleProjectParallelSurfaceDragOver}');
    expect(homeClient).toContain('onDrop={handleProjectParallelSurfaceDrop}');
    expect(homeClient).toContain('resolveProjectParallelDropSide(event)');
    expect(homeClient).toContain('왼쪽에 놓기');
    expect(homeClient).toContain('오른쪽에 놓기');
    expect(homeClient).toContain('className="pc-parallel-chat__composer"');
    expect(uiCss).toContain('.pc-parallel-chat__timeline');
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
    expect(uiCss).toContain('grid-template-columns: minmax(0, 1fr);');
    expect(uiCss).toContain('@media (min-width: 768px)');
    expect(uiCss).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });
});
