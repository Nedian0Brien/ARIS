import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const homeClient = readFileSync(resolve(__dirname, '../app/HomePageClient.tsx'), 'utf8');
const uiCss = readFileSync(resolve(__dirname, '../app/styles/ui.css'), 'utf8');

function cssBlock(selector: string) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(uiCss)?.[1] ?? '';
}

describe('project list surface', () => {
  it('opens the Project entry point as the project list screen from the IA v2 mockup', () => {
    expect(homeClient).toContain("project: { title: 'Projects'");
    expect(homeClient).toContain('function ProjectSurface({');
    expect(homeClient).toContain('className="proj-list-wrap"');
    expect(homeClient).toContain('className="proj-list-toolbar"');
    expect(homeClient).toContain('placeholder="Search projects..."');
    expect(homeClient).toContain("['All', 'Active', 'Recent', 'Archived']");
    expect(homeClient).toContain('className="proj-list-grid"');
    expect(homeClient).toContain('className="proj-list-card"');
    expect(homeClient).toContain('className="proj-list-card proj-list-card--new"');
    expect(homeClient).toContain('className="proj-list-new-btn"');
    expect(homeClient).not.toContain('const selected = sortSessions(sessions)[0] ?? null;');
  });

  it('routes project card clicks to the IA project detail instead of the legacy session screen', () => {
    expect(homeClient).toContain("type ProjectView = 'overview' | 'chats' | 'chat' | 'files' | 'context';");
    expect(homeClient).toContain("function buildProjectDetailPath(sessionId: string, view: ProjectView = 'overview', chatId?: string | null)");
    expect(homeClient).toContain("params.set('tab', 'project');");
    expect(homeClient).toContain("params.set('project', sessionId);");
    expect(homeClient).toContain("if (view === 'chat' && chatId) {");
    expect(homeClient).toContain("params.set('chat', chatId);");
    expect(homeClient).toContain('data-project-href={buildProjectDetailPath(session.id)}');
    expect(homeClient).toContain('onClick={() => onProjectOpen(session.id)}');
    expect(homeClient).toContain('onProjectOpen(session.id);');
    expect(homeClient).toContain("window.history.pushState(null, '', withAppBasePath(buildProjectDetailPath(sessionId, view, chatId)))");
    expect(homeClient).toContain('selectedProjectId={selectedProjectId}');
    expect(homeClient).not.toContain('navigateTo(`/sessions/${session.id}`)');
  });

  it('renders the IA project detail surface from the selected project query param', () => {
    expect(homeClient).toContain('function ProjectDetailSurface({');
    expect(homeClient).toContain('className="m-main-scroll m-main-scroll--project-detail"');
    expect(homeClient).toContain('className="proj-head"');
    expect(homeClient).toContain('className="proj-tabs"');
    expect(homeClient).toContain('className="proj-pane"');
    expect(homeClient).toContain("setSelectedProjectId(nextTab === 'project' ? (searchParams.get('project') ?? null) : null);");
    expect(homeClient).toContain("const nextProjectView = nextTab === 'project' ? normalizeProjectView(searchParams.get('view')) : 'overview';");
    expect(homeClient).toContain('setSelectedProjectView(nextProjectView);');
    expect(homeClient).toContain('if (selectedProject) {');
  });

  it('keeps project chat inside the IA project route instead of opening the legacy session route', () => {
    expect(homeClient).toContain('function ProjectChatSurface({');
    expect(homeClient).toContain('data-project-chat-list');
    expect(homeClient).toContain('data-project-chat-screen');
    expect(homeClient).toContain('m-main-scroll--project-chat-detail');
    expect(homeClient).toContain("onClick={() => onProjectOpen(session.id, 'chats')}");
    expect(homeClient).toContain("onClick={() => onProjectViewChange('chats')}");
    expect(homeClient).toContain("onClick={() => onChatOpen(chat.id)}");
    expect(homeClient).toContain("onProjectChatOpen(session.id, chat.id)");
    expect(homeClient).toContain("setSelectedProjectView('chat');");
    expect(homeClient).toContain("buildProjectDetailPath(sessionId, 'chat', chatId)");
    expect(homeClient).toContain("params.set('view', view);");
    expect(homeClient).toContain('/api/runtime/sessions/${encodeURIComponent(session.id)}/chats');
    expect(homeClient).toContain('/api/runtime/sessions/${encodeURIComponent(session.id)}/events');
    expect(homeClient).not.toContain('/sessions/${session.id}');
  });

  it('keeps project chats nested under the selected project in the redesigned sidebar', () => {
    expect(homeClient).toContain('activeProjectChatId: string | null;');
    expect(homeClient).toContain('className={`m-sb__project-node${isActiveProject ?');
    expect(homeClient).toContain('className="m-sb__chat-children"');
    expect(homeClient).toContain("className={`m-sb__chat-child${activeProjectChatId === chat.id ? ' m-sb__chat-child--active' : ''}`}");
    expect(homeClient).toContain("onClick={() => onProjectChatOpen(session.id, chat.id)}");
    expect(homeClient).toContain("setSelectedProjectChatId(nextTab === 'project' && nextProjectView === 'chat' ? (searchParams.get('chat') ?? null) : null);");
  });

  it('ships the project list CSS copied into the app stylesheet', () => {
    [
      '.proj-list-wrap',
      '.proj-list-toolbar',
      '.proj-list-search',
      '.proj-list-chips',
      '.proj-list-chip--active',
      '.proj-list-grid',
      '.proj-list-card',
      '.proj-list-card--new',
      '.proj-list-stats',
      '.proj-list-new-btn',
      '.pc-chat-directory',
      '.pc-chat-row',
      '.pc-proto .shell',
      '.pc-proto .ch',
      '.pc-proto .tl',
      '.pc-proto .msg',
      '.pc-proto .tool',
      '.pc-proto .code',
      '.pc-proto .artifact',
      '.pc-proto .cmp',
      '.pc-proto .ws',
      '.m-sb__chat-children',
      '.m-sb__chat-child',
    ].forEach((selector) => {
      expect(uiCss).toContain(selector);
    });

    [
      '.proj-chat-screen',
      '.proj-chat-list',
      '.proj-chat-main',
      '.proj-chat-timeline',
      '.proj-chat-composer',
    ].forEach((selector) => {
      expect(uiCss).not.toContain(selector);
    });
  });

  it('keeps the project filter chips attached to the search field instead of the screen edge', () => {
    const toolbar = cssBlock('.proj-list-toolbar');
    const chips = cssBlock('.proj-list-chips');

    expect(toolbar).toContain('gap: var(--sp-3);');
    expect(chips).toContain('margin-left: 0;');
    expect(chips).not.toContain('margin-left: auto;');
  });
});
