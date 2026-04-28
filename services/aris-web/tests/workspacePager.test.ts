import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkspacePanelLayout } from '@/lib/workspacePanels/types';

type PagerItem =
  | { id: 'chat'; kind: 'chat' }
  | { id: 'workspace'; kind: 'workspace' }
  | { id: 'create-panel'; kind: 'create-panel' }
  | { id: string; kind: 'panel'; panelId: string };

type PagerModelModule = {
  buildWorkspacePagerItems?: (layout: WorkspacePanelLayout) => PagerItem[];
  moveWorkspacePager?: (items: PagerItem[], currentId: string, direction: 'previous' | 'next') => string;
};

type PagerComponentModule = {
  WorkspacePager?: (props: {
    items: PagerItem[];
    activePageId: string;
    renderChatPage: () => React.ReactNode;
    renderCreatePage: () => React.ReactNode;
    renderWorkspacePage?: (item: Extract<PagerItem, { kind: 'workspace' }>) => React.ReactNode;
    renderPanelPage: (item: Extract<PagerItem, { kind: 'panel' }>) => React.ReactNode;
  }) => React.ReactNode;
};

type PagerGestureModule = {
  resolveWorkspacePagerSwipeTarget?: (
    items: PagerItem[],
    activePageId: string,
    deltaX: number,
    thresholdPx: number,
  ) => string;
};

async function loadPagerModelModule(): Promise<PagerModelModule> {
  return import('@/app/sessions/[sessionId]/workspace-panels/pagerModel').catch(() => ({}));
}

async function loadPagerComponentModule(): Promise<PagerComponentModule> {
  return import('@/app/sessions/[sessionId]/workspace-panels/WorkspacePager').catch(() => ({}));
}

async function loadPagerGestureModule(): Promise<PagerGestureModule> {
  return import('@/app/sessions/[sessionId]/workspace-panels/swipeGesture').catch(() => ({}));
}

describe('workspace pager model', () => {
  it('derives chat first and the single workspace page second', async () => {
    const mod = await loadPagerModelModule();

    expect(typeof mod.buildWorkspacePagerItems).toBe('function');
    if (typeof mod.buildWorkspacePagerItems !== 'function') return;

    expect(mod.buildWorkspacePagerItems({
      version: 1,
      activePage: { kind: 'chat' },
      panels: [],
    })).toEqual([
      { id: 'chat', kind: 'chat' },
      { id: 'workspace', kind: 'workspace' },
    ]);
  });

  it('navigates between chat and the single workspace page', async () => {
    const mod = await loadPagerModelModule();

    expect(typeof mod.buildWorkspacePagerItems).toBe('function');
    expect(typeof mod.moveWorkspacePager).toBe('function');
    if (typeof mod.buildWorkspacePagerItems !== 'function' || typeof mod.moveWorkspacePager !== 'function') return;

    const items = mod.buildWorkspacePagerItems({
      version: 1,
      activePage: { kind: 'panel', panelId: 'panel-preview-1' },
      panels: [
        {
          id: 'panel-preview-1',
          type: 'preview',
          title: 'Preview',
          config: { port: 3305, path: '/' },
          createdAt: '2026-04-16T00:00:00.000Z',
        },
      ],
    });

    expect(items).toEqual([
      { id: 'chat', kind: 'chat' },
      { id: 'workspace', kind: 'workspace' },
    ]);
    expect(mod.moveWorkspacePager(items, 'chat', 'next')).toBe('workspace');
    expect(mod.moveWorkspacePager(items, 'workspace', 'previous')).toBe('chat');
    expect(mod.moveWorkspacePager(items, 'workspace', 'next')).toBe('workspace');
  });

  it('renders chat and workspace pages in order', async () => {
    const mod = await loadPagerComponentModule();

    expect(typeof mod.WorkspacePager).toBe('function');
    if (typeof mod.WorkspacePager !== 'function') return;

    const markup = renderToStaticMarkup(createElement(mod.WorkspacePager, {
      items: [
        { id: 'chat', kind: 'chat' },
        { id: 'workspace', kind: 'workspace' },
      ],
      activePageId: 'chat',
      renderChatPage: () => createElement('div', null, 'Chat Page'),
      renderCreatePage: () => createElement('div', null, 'Create Panel'),
      renderWorkspacePage: () => createElement('div', null, 'Workspace Page'),
      renderPanelPage: () => createElement('div', null, 'Preview Page'),
    }));

    expect(markup).toContain('Chat Page');
    expect(markup).toContain('Workspace Page');
    expect(markup.indexOf('Chat Page')).toBeLessThan(markup.indexOf('Workspace Page'));
  });

  it('changes page only when the swipe crosses the threshold', async () => {
    const mod = await loadPagerGestureModule();

    expect(typeof mod.resolveWorkspacePagerSwipeTarget).toBe('function');
    if (typeof mod.resolveWorkspacePagerSwipeTarget !== 'function') return;

    const items: PagerItem[] = [
      { id: 'chat', kind: 'chat' },
      { id: 'workspace', kind: 'workspace' },
    ];

    expect(mod.resolveWorkspacePagerSwipeTarget(items, 'chat', -80, 60)).toBe('workspace');
    expect(mod.resolveWorkspacePagerSwipeTarget(items, 'workspace', 80, 60)).toBe('chat');
    expect(mod.resolveWorkspacePagerSwipeTarget(items, 'workspace', -59, 60)).toBe('workspace');
    expect(mod.resolveWorkspacePagerSwipeTarget(items, 'workspace', -120, 60)).toBe('workspace');
  });
});
