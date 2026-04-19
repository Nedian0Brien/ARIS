import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dashboardCssPath = resolve(__dirname, '../app/SessionDashboard.module.css');
const dashboardTsxPath = resolve(__dirname, '../app/SessionDashboard.tsx');
const uiCssPath = resolve(__dirname, '../app/styles/ui.css');
const fabCssPath = resolve(__dirname, '../app/styles/fab.css');
const workspaceHomeCssPath = resolve(__dirname, '../app/sessions/[sessionId]/WorkspaceHome.module.css');
const chatInterfaceCssPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css');

const dashboardCss = readFileSync(dashboardCssPath, 'utf8');
const dashboardTsx = readFileSync(dashboardTsxPath, 'utf8');
const uiCss = readFileSync(uiCssPath, 'utf8');
const fabCss = readFileSync(fabCssPath, 'utf8');
const workspaceHomeCss = readFileSync(workspaceHomeCssPath, 'utf8');
const chatInterfaceCss = readFileSync(chatInterfaceCssPath, 'utf8');

describe('mobile home/workspace layout overflow guards', () => {
  it('stacks the home dashboard title row and primary action on phones', () => {
    expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.dashboardTitleRow\s*\{[^}]*flex-direction:\s*column;/s);
    expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.dashboardTitleRow\s*\{[^}]*align-items:\s*stretch;/s);
    expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.dashboardCreateButton\s*\{[^}]*width:\s*100%;/s);
  });

  it('preserves horizontal page gutters on the mobile sessions landing page', () => {
    expect(uiCss).toMatch(/\.container\s*\{[^}]*padding:\s*0 0\.75rem;/s);
    expect(fabCss).toMatch(/\.main\s*\{[^}]*padding-block:\s*1\.5rem;/s);
    expect(fabCss).toMatch(/@media\s*\(min-width:\s*768px\)\s*\{[\s\S]*?\.main\s*\{[^}]*padding-block:\s*2rem;/s);
  });

  it('uses a single-column server resource grid on narrow phones', () => {
    expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.serverResourceGridHorizontal\s*\{[^}]*display:\s*flex;/s);
    expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.serverResourceGridHorizontal\s*\{[^}]*flex-direction:\s*column;/s);
  });

  it('uses minmax(0, 1fr) for mobile dashboard grid tracks', () => {
    expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*999px\)\s*\{[\s\S]*?\.sessionDashboardLayout\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
    expect(dashboardCss).toMatch(/@media\s*\(max-width:\s*999px\)\s*\{[\s\S]*?\.sessionDashboardSidebar\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
  });

  it('collapses workspace summary cards to one column on small screens', () => {
    expect(workspaceHomeCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.statsRow\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
  });

  it('lets the workspace path text shrink within the hero row on mobile', () => {
    expect(workspaceHomeCss).toMatch(/\.heroMetaPath\s*\{[^}]*min-width:\s*0;/s);
    expect(workspaceHomeCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.heroMetaPath\s*\{[^}]*max-width:\s*100%;/s);
  });

  it('forces long chat titles and previews to shrink within mobile cards', () => {
    expect(workspaceHomeCss).toMatch(/\.chatItemTop\s*\{[^}]*min-width:\s*0;/s);
    expect(workspaceHomeCss).toMatch(/\.chatItemTop\s*\{[^}]*width:\s*100%;/s);
    expect(workspaceHomeCss).toMatch(/\.chatItemTop\s*\{[^}]*max-width:\s*100%;/s);
    expect(workspaceHomeCss).toMatch(/\.chatItemTitle\s*\{[^}]*min-width:\s*0;/s);
    expect(workspaceHomeCss).toMatch(/\.chatItemTitle\s*\{[^}]*display:\s*block;/s);
    expect(workspaceHomeCss).toMatch(/\.chatItemTitle\s*\{[^}]*max-width:\s*100%;/s);
    expect(workspaceHomeCss).toMatch(/\.chatItemPreview\s*\{[^}]*min-width:\s*0;/s);
    expect(workspaceHomeCss).toMatch(/\.chatItemPreview\s*\{[^}]*max-width:\s*100%;/s);
    expect(workspaceHomeCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.chatItemMeta\s*\{[^}]*max-width:\s*100%;/s);
    expect(workspaceHomeCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.chatItemMeta\s*\{[^}]*flex-wrap:\s*wrap;/s);
    expect(workspaceHomeCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.chatItemPreview\s*\{[^}]*white-space:\s*normal;/s);
    expect(workspaceHomeCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.chatItemPreview\s*\{[^}]*overflow-wrap:\s*anywhere;/s);
  });

  it('renders the workspace status mini-list with overflow guards', () => {
    expect(dashboardTsx).toMatch(/className=\{styles\.sessionMiniTextGroup\}/);
    expect(dashboardTsx).toMatch(/chatStats\.runningSample\.map\(chat =>/);
    expect(dashboardTsx).toMatch(/chatStats\.completedSample\.map\(chat =>/);
    expect(dashboardCss).toMatch(/\.sessionMiniList\s*\{[^}]*max-width:\s*100%;/s);
    expect(dashboardCss).toMatch(/\.sessionMiniItem\s*\{[^}]*min-width:\s*0;/s);
    expect(dashboardCss).toMatch(/\.sessionMiniTextGroup\s*\{[^}]*min-width:\s*0;/s);
    expect(dashboardCss).toMatch(/\.sessionMiniName\s*\{[^}]*overflow:\s*hidden;/s);
    expect(dashboardCss).toMatch(/\.sessionMiniName\s*\{[^}]*text-overflow:\s*ellipsis;/s);
    expect(dashboardCss).toMatch(/\.sessionMiniName\s*\{[^}]*white-space:\s*nowrap;/s);
    expect(dashboardCss).toMatch(/\.sessionMiniSubName\s*\{[^}]*overflow:\s*hidden;/s);
    expect(dashboardCss).toMatch(/\.sessionMiniSubName\s*\{[^}]*text-overflow:\s*ellipsis;/s);
    expect(dashboardCss).toMatch(/\.sessionMiniSubName\s*\{[^}]*white-space:\s*nowrap;/s);
    expect(dashboardCss).toMatch(/\.sessionSidebarCard\s*\{[^}]*max-width:\s*100%;/s);
    expect(dashboardCss).toMatch(/\.sessionSidebarCard\s*\{[^}]*box-sizing:\s*border-box;/s);
    expect(dashboardCss).toMatch(/\.sessionDashboardSidebar\s*\{[^}]*max-width:\s*100%;/s);
    expect(dashboardCss).toMatch(/\.sessionDashboardSidebar\s*\{[^}]*min-width:\s*0;/s);
    expect(dashboardCss).toMatch(/\.sessionDashboardLayout\s*\{[^}]*box-sizing:\s*border-box;/s);
    expect(dashboardCss).toMatch(/\.serverStorageCardFull\s*\{[^}]*box-sizing:\s*border-box;/s);
  });

  it('keeps the last-user jump bar shrinkable on narrow screens', () => {
    expect(chatInterfaceCss).toMatch(/\.lastUserJumpButton\s*\{[^}]*width:\s*100%;/s);
    expect(chatInterfaceCss).toMatch(/\.lastUserJumpButton\s*\{[^}]*max-width:\s*100%;/s);
    expect(chatInterfaceCss).toMatch(/\.lastUserJumpPreview\s*\{[^}]*min-width:\s*0;/s);
    expect(chatInterfaceCss).toMatch(/\.lastUserJumpPreview\s*\{[^}]*overflow:\s*hidden;/s);
    expect(chatInterfaceCss).toMatch(/\.lastUserJumpPreview\s*\{[^}]*text-overflow:\s*ellipsis;/s);
    expect(chatInterfaceCss).toMatch(/@media\s*\(max-width:\s*640px\)\s*\{[\s\S]*?\.lastUserJumpButton\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
  });
});
