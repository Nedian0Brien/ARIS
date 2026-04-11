import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardCssPath = resolve(__dirname, '../app/SessionDashboard.module.css');
const dashboardTsxPath = resolve(__dirname, '../app/SessionDashboard.tsx');
const workspaceHomeCssPath = resolve(__dirname, '../app/sessions/[sessionId]/WorkspaceHome.module.css');

const dashboardCss = readFileSync(dashboardCssPath, 'utf8');
const dashboardTsx = readFileSync(dashboardTsxPath, 'utf8');
const workspaceHomeCss = readFileSync(workspaceHomeCssPath, 'utf8');

describe('mobile home/workspace layout overflow guards', () => {
  it('stacks the home dashboard title row and primary action on phones', () => {
    expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.dashboardTitleRow\s*\{[^}]*flex-direction:\s*column;/s);
    expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.dashboardTitleRow\s*\{[^}]*align-items:\s*stretch;/s);
    expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.dashboardCreateButton\s*\{[^}]*width:\s*100%;/s);
  });

  it('uses a single-column server resource grid on narrow phones', () => {
    expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.serverResourceGridHorizontal\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
  });

  it('collapses workspace summary cards to one column on small screens', () => {
    expect(workspaceHomeCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.statsRow\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
  });

  it('lets the workspace path text shrink within the hero row on mobile', () => {
    expect(workspaceHomeCss).toMatch(/\.heroMetaPath\s*\{[^}]*min-width:\s*0;/s);
    expect(workspaceHomeCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.heroMetaPath\s*\{[^}]*max-width:\s*100%;/s);
  });

  it('groups workspace status chat titles into a shrinkable text column', () => {
    expect(dashboardTsx).toMatch(/className=\{styles\.sessionMiniTextGroup\}/);
    expect(dashboardCss).toMatch(/\.sessionMiniTextGroup\s*\{[^}]*flex:\s*1;/s);
    expect(dashboardCss).toMatch(/\.sessionMiniTextGroup\s*\{[^}]*min-width:\s*0;/s);
    expect(dashboardCss).toMatch(/\.sessionMiniSubName\s*\{[^}]*max-width:\s*100%;/s);
    expect(dashboardCss).toMatch(/\.sessionMiniSubName\s*\{[^}]*flex-shrink:\s*1;/s);
  });
});
