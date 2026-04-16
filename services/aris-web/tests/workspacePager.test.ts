import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { WorkspacePanelLayout } from '@/lib/workspacePanels/types';

type PagerItem =
  | { id: 'chat'; kind: 'chat' }
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
    renderPanelPage: (item: Extract<PagerItem, { kind: 'panel' }>) => React.ReactNode;
  }) => React.ReactNode;
};

async function loadPagerModelModule(): Promise<PagerModelModule> {
  return import('@/app/sessions/[sessionId]/workspace-panels/pagerModel').catch(() => ({}));
}

async function loadPagerComponentModule(): Promise<PagerComponentModule> {
  return import('@/app/sessions/[sessionId]/workspace-panels/WorkspacePager').catch(() => ({}));
}

describe('workspace pager model', () => {
  it('derives chat first and create-panel last when no panels exist', async () => {
    const mod = await loadPagerModelModule();

    expect(typeof mod.buildWorkspacePagerItems).toBe('function');
    if (typeof mod.buildWorkspacePagerItems !== 'function') return;

    expect(mod.buildWorkspacePagerItems({
      version: 1,
      activePage: { kind: 'chat' },
      panels: [],
    })).toEqual([
      { id: 'chat', kind: 'chat' },
      { id: 'create-panel', kind: 'create-panel' },
    ]);
  });

  it('navigates between chat, existing panels, and the create-panel page', async () => {
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
      { id: 'panel-preview-1', kind: 'panel', panelId: 'panel-preview-1' },
      { id: 'create-panel', kind: 'create-panel' },
    ]);
    expect(mod.moveWorkspacePager(items, 'chat', 'next')).toBe('panel-preview-1');
    expect(mod.moveWorkspacePager(items, 'panel-preview-1', 'previous')).toBe('chat');
    expect(mod.moveWorkspacePager(items, 'panel-preview-1', 'next')).toBe('create-panel');
  });

  it('renders chat, panel, and create-panel pages in order', async () => {
    const mod = await loadPagerComponentModule();

    expect(typeof mod.WorkspacePager).toBe('function');
    if (typeof mod.WorkspacePager !== 'function') return;

    const markup = renderToStaticMarkup(createElement(mod.WorkspacePager, {
      items: [
        { id: 'chat', kind: 'chat' },
        { id: 'panel-preview-1', kind: 'panel', panelId: 'panel-preview-1' },
        { id: 'create-panel', kind: 'create-panel' },
      ],
      activePageId: 'chat',
      renderChatPage: () => createElement('div', null, 'Chat Page'),
      renderCreatePage: () => createElement('div', null, 'Create Panel'),
      renderPanelPage: () => createElement('div', null, 'Preview Page'),
    }));

    expect(markup).toContain('Chat Page');
    expect(markup).toContain('Preview Page');
    expect(markup).toContain('Create Panel');
    expect(markup.indexOf('Chat Page')).toBeLessThan(markup.indexOf('Preview Page'));
    expect(markup.indexOf('Preview Page')).toBeLessThan(markup.indexOf('Create Panel'));
  });
});
