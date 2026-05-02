import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const chatInterfaceTsxPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.tsx');
const chatInterfaceCssPath = resolve(__dirname, '../app/sessions/[sessionId]/ChatInterface.module.css');
const viewportHeightSyncPath = resolve(__dirname, '../components/layout/ViewportHeightSync.tsx');

const chatInterfaceTsx = readFileSync(chatInterfaceTsxPath, 'utf8');
const chatInterfaceCss = readFileSync(chatInterfaceCssPath, 'utf8');
const viewportHeightSync = readFileSync(viewportHeightSyncPath, 'utf8');

describe('chat composer dock desktop layout guards', () => {
  it('syncs composer dock metrics before paint so new chats do not flash into the sidebar lane', () => {
    expect(chatInterfaceTsx).toMatch(/useLayoutEffect/);
    expect(chatInterfaceTsx).toMatch(/useLayoutEffect\(\(\) => \{\s*syncComposerDockMetrics\(\);/s);
  });

  it('opens mobile tail restore only after composer layout metrics reach a quiet window', () => {
    expect(chatInterfaceTsx).toContain('const isTailRestoreLayoutReady = resolveTailRestoreLayoutReady({');
    expect(chatInterfaceTsx).toContain('isViewportLayoutReady');
    expect(chatInterfaceTsx).toContain('haveComposerDockMetricsChanged(composerDockMetricsRef.current, nextMetrics)');
    expect(chatInterfaceTsx).toMatch(/window\.setTimeout\(\(\) => \{\s*composerDockLayoutReadyTimeoutRef\.current = 0;\s*setIsComposerDockLayoutReady\(true\);/s);
  });

  it('uses a desktop-safe default dock width instead of expanding across the full viewport', () => {
    expect(chatInterfaceCss).not.toContain('--composer-dock-width: calc(100vw - 1.5rem);');
  });

  it('keeps the mobile composer above browser chrome using visual viewport bottom inset', () => {
    expect(chatInterfaceCss).toContain('--chat-viewport-bottom-inset: max(var(--keyboard-inset-height, 0px), var(--visual-viewport-bottom-inset, 0px));');
    expect(chatInterfaceCss).toContain('--composer-dock-bottom-offset');
    expect(chatInterfaceCss).toContain('--chat-timeline-bottom-offset');
    expect(chatInterfaceCss).toMatch(/\.composerDock\s*\{[\s\S]*bottom:\s*var\(--composer-dock-bottom-offset\);/);
    expect(chatInterfaceCss).toMatch(/\.csTimeline\s*\{[\s\S]*padding:[\s\S]*var\(--chat-timeline-bottom-offset\);/);
  });

  it('pins the mobile composer dock to the viewport instead of the scroll container', () => {
    expect(chatInterfaceCss).toMatch(/@media\s*\(max-width:\s*960px\)\s*\{[\s\S]*?\.composerDock\s*\{[^}]*position:\s*fixed;/s);
    expect(chatInterfaceCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.composerDock\s*\{[^}]*position:\s*fixed;/s);
    expect(chatInterfaceCss).toMatch(/@media\s*\(max-width:\s*767px\)\s*\{[\s\S]*?\.composerDock\s*\{[^}]*bottom:\s*var\(--composer-dock-bottom-offset\);/s);
  });

  it('derives browser chrome obstruction from visual viewport and layout viewport heights', () => {
    expect(viewportHeightSync).toContain('const layoutBottomInset = Math.max(0, layoutViewportHeight - height - viewportOffsetTop);');
    expect(viewportHeightSync).toContain('const visualViewportBottomInset = Math.max(historicalBottomInset, layoutBottomInset);');
    expect(viewportHeightSync).toContain("root.style.setProperty('--visual-viewport-bottom-inset', `${visualViewportBottomInset}px`);");
    expect(viewportHeightSync).toContain("root.style.removeProperty('--visual-viewport-bottom-inset');");
  });
});
