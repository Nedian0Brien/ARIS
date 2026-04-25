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
    expect(homeClient).toContain('function buildProjectDetailPath(sessionId: string)');
    expect(homeClient).toContain("`/?tab=project&project=${encodeURIComponent(sessionId)}`");
    expect(homeClient).toContain('data-project-href={buildProjectDetailPath(session.id)}');
    expect(homeClient).toContain('onClick={() => onProjectOpen(session.id)}');
    expect(homeClient).toContain('onProjectOpen(session.id);');
    expect(homeClient).toContain('window.history.pushState(null, \'\', withAppBasePath(buildProjectDetailPath(sessionId)))');
    expect(homeClient).toContain('selectedProjectId={selectedProjectId}');
    expect(homeClient).not.toContain('aria-label={`${displayProjectName(session)} 프로젝트 열기`}\\n              onClick={() => navigateTo(`/sessions/${session.id}`)}');
  });

  it('renders the IA project detail surface from the selected project query param', () => {
    expect(homeClient).toContain('function ProjectDetailSurface({');
    expect(homeClient).toContain('className="m-main-scroll m-main-scroll--project-detail"');
    expect(homeClient).toContain('className="proj-head"');
    expect(homeClient).toContain('className="proj-tabs"');
    expect(homeClient).toContain('className="proj-pane"');
    expect(homeClient).toContain("setSelectedProjectId(nextTab === 'project' ? (searchParams.get('project') ?? null) : null);");
    expect(homeClient).toContain('if (selectedProject) {');
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
    ].forEach((selector) => {
      expect(uiCss).toContain(selector);
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
