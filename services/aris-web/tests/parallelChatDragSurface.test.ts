import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const homeClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');
const projectChatSurface = readFileSync(resolve(__dirname, '../components/project-chat/ProjectChatSurface.tsx'), 'utf8');
const uiCss = readFileSync(resolve(__dirname, '../app/styles/ui.css'), 'utf8');

function cssBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = uiCss.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\}`));
  return match?.[1] ?? '';
}

describe('project parallel chat drag surface', () => {
  it('renders split panels in-process instead of embedding the app in iframes', () => {
    expect(projectChatSurface).toContain('function ProjectParallelChatPane({');
    expect(projectChatSurface).toContain('<ProjectParallelChatPane');
    expect(projectChatSurface).toContain('buildProjectRuntimeEventsPath(projectId, params)');
    expect(projectChatSurface).not.toContain('className="pc-parallel__iframe"');
    expect(projectChatSurface).not.toContain('<iframe');
    expect(projectChatSurface).not.toContain('/api/parallel-workspaces');
  });

  it('makes project sidebar chat children draggable', () => {
    expect(projectChatSurface).toContain("export const PROJECT_CHAT_DRAG_MIME = 'application/x-aris-project-chat';");
    expect(projectChatSurface).toContain("export const PROJECT_CHAT_DRAG_JSON_MIME = 'application/json';");
    expect(homeClient).toContain('writeProjectChatDragPayload(event, session.id, chat)');
    expect(projectChatSurface).toContain('writeProjectChatDragPayload(event, projectId, chat)');
    expect(projectChatSurface).toContain('projectId: parsedProjectId');
    expect(projectChatSurface).not.toContain('sessionId: parsed.sessionId');
    expect(projectChatSurface).toContain("event.dataTransfer.setData('text/plain', payload);");
    expect(homeClient).toContain('className={`m-sb__chat-child${activeProjectChatId === chat.id ?');
  });

  it('renders drop zones and direct project chat panels inside ProjectChatSurface', () => {
    expect(projectChatSurface).toContain('ProjectParallelDropOverlay');
    expect(projectChatSurface).toContain('ProjectParallelPanelTree');
    expect(projectChatSurface).toContain('handleProjectParallelPanelDrop');
    expect(projectChatSurface).toContain('onDragOver={handleProjectParallelSurfaceDragOver}');
    expect(projectChatSurface).toContain('onDrop={handleProjectParallelSurfaceDrop}');
    expect(projectChatSurface).toContain('resolveProjectParallelDropEdge(event)');
    expect(projectChatSurface).toContain('computeProjectPanelDropEdge(event.clientX, event.clientY, rect)');
    expect(projectChatSurface).toContain('function ProjectChatComposer({');
    expect(projectChatSurface).toContain('<ProjectChatComposer');
    expect(projectChatSurface).not.toContain('className="pc-parallel-chat__composer"');
    expect(uiCss).toContain('.pc-parallel-chat__timeline');
    expect(uiCss).toContain('.pc-proto .pc-parallel .cmp-wrap');
  });

  it('persists project panel layout per project workspace', () => {
    expect(projectChatSurface).toContain('createProjectPanelLayoutStorageKey(projectId)');
    expect(projectChatSurface).toContain('parseProjectPanelState(');
    expect(projectChatSurface).toContain('serializeProjectPanelState(parallelPanelState)');
    expect(projectChatSurface).toContain('readLocalStorage(parallelLayoutStorageKey)');
    expect(projectChatSurface).toContain('writeLocalStorage(parallelLayoutStorageKey');
    expect(projectChatSurface).toContain('removeLocalStorage(parallelLayoutStorageKey)');
  });

  it('supports compact project panel mode instead of the legacy session screen', () => {
    expect(projectChatSurface).toContain("export type ProjectChatSurfaceMode = 'full' | 'panel';");
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
    const splitChatViewportBlock = cssBlock('.pc-parallel');
    const framesBlock = cssBlock('.pc-parallel__frames');
    const frameBlock = cssBlock('.pc-parallel__frame');
    const parallelChatBlock = cssBlock('.pc-parallel-chat');
    const timelineBlock = cssBlock('.pc-parallel-chat__timeline');
    const composerWrapBlock = cssBlock('.pc-proto .pc-parallel .cmp-wrap');
    expect(splitChatViewportBlock).toContain('height: 100%;');
    expect(splitChatViewportBlock).toContain('min-height: 0;');
    expect(uiCss).toContain('.pc-parallel-shell');
    expect(framesBlock).toContain('height: 100%;');
    expect(framesBlock).toContain('overflow: hidden;');
    expect(frameBlock).toContain('align-self: stretch;');
    expect(frameBlock).toContain('width: 100%;');
    expect(frameBlock).toContain('height: 100%;');
    expect(parallelChatBlock).toContain('max-height: 100%;');
    expect(parallelChatBlock).toContain('overflow: hidden;');
    expect(timelineBlock).toContain('overflow-y: auto;');
    expect(timelineBlock).toContain('overscroll-behavior: contain;');
    expect(composerWrapBlock).toContain('align-self: end;');
    expect(composerWrapBlock).toContain('min-height: 0;');
    expect(composerWrapBlock).toContain('padding: var(--sp-4);');
    expect(cssBlock('.pc-proto .pc-parallel .cmp__input')).toContain('min-height: 44px;');
    expect(cssBlock('.pc-proto .pc-parallel .cmp__input')).toContain('max-height: 112px;');
  });

  it('does not expose a parallel workspace level return-to-single-chat action', () => {
    expect(projectChatSurface).not.toContain('단일 채팅으로 돌아가기');
    expect(projectChatSurface).not.toContain('handleCloseProjectParallelChats');
    expect(uiCss).not.toContain('.pc-parallel__bar-btn');
  });

  it('routes panel-scoped Files and Git through the existing workspace drawer', () => {
    expect(projectChatSurface).toContain('workspacePanelId: panelId');
    expect(projectChatSurface).toContain('workspacePanelId: activeWorkspacePanelId');
    expect(projectChatSurface).toContain('useWorkspaceFiles');
    expect(projectChatSurface).toContain('fetchProjectPanelGitOverview');
    expect(projectChatSurface).toContain('pc-parallel-workspace');
    expect(projectChatSurface).toContain('onOpenPanelWorkspaceTab');
    expect(projectChatSurface).toContain("data-tab=\"git\"");
    expect(projectChatSurface).toContain("data-pane=\"git\"");
    expect(projectChatSurface).not.toContain("type ProjectParallelPanelTool = 'chat' | 'files' | 'git';");
    expect(projectChatSurface).not.toContain('aria-label="Open panel files"');
    expect(projectChatSurface).not.toContain('aria-label="Open panel Git"');
  });

  it('communicates that closing a panel preserves the underlying chat', () => {
    expect(projectChatSurface).toContain('Close panel; chat stays in the list');
    expect(projectChatSurface).toContain('패널만 닫힙니다');
  });
});
