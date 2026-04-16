import React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

type AnyElement = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

type CreatePanelPageModule = {
  CreatePanelPage?: (props: { onCreatePanel: (type: 'preview' | 'explorer' | 'terminal' | 'bookmark') => void }) => React.ReactNode;
};

type PlaceholderPanelPageModule = {
  PlaceholderPanelPage?: (props: { title: string; description: string }) => React.ReactNode;
};

async function loadCreatePanelPageModule(): Promise<CreatePanelPageModule> {
  return import('@/app/sessions/[sessionId]/workspace-panels/CreatePanelPage').catch(() => ({}));
}

async function loadPlaceholderPanelPageModule(): Promise<PlaceholderPanelPageModule> {
  return import('@/app/sessions/[sessionId]/workspace-panels/PlaceholderPanelPage').catch(() => ({}));
}

function isElement(node: ReactNode): node is AnyElement {
  return node !== null && typeof node === 'object' && 'props' in node;
}

function flattenElements(node: ReactNode): AnyElement[] {
  if (Array.isArray(node)) {
    return node.flatMap(flattenElements);
  }

  if (!isElement(node)) {
    return [];
  }

  return [node, ...flattenElements(node.props.children)];
}

describe('workspace panel creation surfaces', () => {
  it('renders all supported panel creation tiles', async () => {
    const mod = await loadCreatePanelPageModule();

    expect(typeof mod.CreatePanelPage).toBe('function');
    if (typeof mod.CreatePanelPage !== 'function') return;

    const markup = renderToStaticMarkup(React.createElement(mod.CreatePanelPage, {
      onCreatePanel: vi.fn(),
    }));

    expect(markup).toContain('Preview');
    expect(markup).toContain('Explorer');
    expect(markup).toContain('Terminal');
    expect(markup).toContain('Bookmark');
  });

  it('calls back with the selected panel type', async () => {
    const mod = await loadCreatePanelPageModule();

    expect(typeof mod.CreatePanelPage).toBe('function');
    if (typeof mod.CreatePanelPage !== 'function') return;

    const onCreatePanel = vi.fn();
    const tree = mod.CreatePanelPage({ onCreatePanel });
    const previewButton = flattenElements(tree).find((element) => {
      const text = renderToStaticMarkup(React.createElement(React.Fragment, null, element.props.children));
      return element.type === 'button' && text.includes('Preview');
    });

    expect(previewButton).toBeTruthy();
    previewButton?.props.onClick?.();

    expect(onCreatePanel).toHaveBeenCalledWith('preview');
  });

  it('renders placeholder panel messaging for non-preview pages', async () => {
    const mod = await loadPlaceholderPanelPageModule();

    expect(typeof mod.PlaceholderPanelPage).toBe('function');
    if (typeof mod.PlaceholderPanelPage !== 'function') return;

    const markup = renderToStaticMarkup(React.createElement(mod.PlaceholderPanelPage, {
      title: 'Explorer',
      description: '파일 트리와 문서 탐색이 여기에 들어옵니다.',
    }));

    expect(markup).toContain('Explorer');
    expect(markup).toContain('파일 트리와 문서 탐색이 여기에 들어옵니다.');
    expect(markup).toContain('준비 중');
  });
});
