import React from 'react';
import type { ReactElement, ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/app/sessions/[sessionId]/workspace-panels/WorkspaceToolsPanelPage', () => ({
  WorkspaceToolsPanelPage: () => React.createElement('div', null, 'Workspace Tools Mock'),
}));

type AnyElement = ReactElement<{ children?: ReactNode; onClick?: () => void }>;

type CreatePanelPageModule = {
  CreatePanelPage?: (props: {
    onCreatePanel: (type: 'preview' | 'explorer' | 'terminal' | 'bookmark') => void;
    onReturnToChat?: () => void;
  }) => React.ReactNode;
};

type PlaceholderPanelPageModule = {
  PlaceholderPanelPage?: (props: {
    title: string;
    description: string;
    onReturnToChat?: () => void;
  }) => React.ReactNode;
};

type PanelPageRendererModule = {
  PanelPageRenderer?: (props: {
    sessionId: string;
    projectName: string;
    workspaceRootPath: string;
    panel: {
      id: string;
      type: 'preview' | 'explorer' | 'terminal' | 'bookmark';
      title: string;
      config: Record<string, unknown>;
      createdAt: string | null;
    };
    requestedFile?: {
      path: string;
      name?: string;
      line?: number | null;
      nonce: number;
    } | null;
    isMobileLayout: boolean;
    onSavePanel?: (panelId: string, updates: { title?: string; config?: Record<string, unknown> }) => Promise<void>;
    onDeletePanel?: (panelId: string) => Promise<void>;
    onReturnToChat?: () => void;
  }) => React.ReactNode;
};

async function loadCreatePanelPageModule(): Promise<CreatePanelPageModule> {
  return import('@/app/sessions/[sessionId]/workspace-panels/CreatePanelPage').catch(() => ({}));
}

async function loadPlaceholderPanelPageModule(): Promise<PlaceholderPanelPageModule> {
  return import('@/app/sessions/[sessionId]/workspace-panels/PlaceholderPanelPage').catch(() => ({}));
}

async function loadPanelPageRendererModule(): Promise<PanelPageRendererModule> {
  return import('@/app/sessions/[sessionId]/workspace-panels/PanelPageRenderer').catch(() => ({}));
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
    expect(markup).toContain('Workspace');
    expect(markup).toContain('Terminal');
    expect(markup).toContain('Bookmark');
  });

  it('renders a back-to-chat escape hatch on the create panel page', async () => {
    const mod = await loadCreatePanelPageModule();

    expect(typeof mod.CreatePanelPage).toBe('function');
    if (typeof mod.CreatePanelPage !== 'function') return;

    const markup = renderToStaticMarkup(React.createElement(mod.CreatePanelPage, {
      onCreatePanel: vi.fn(),
      onReturnToChat: vi.fn(),
    }));

    expect(markup).toContain('채팅으로 돌아가기');
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

  it('renders placeholder panel messaging for non-workspace utility pages', async () => {
    const mod = await loadPlaceholderPanelPageModule();

    expect(typeof mod.PlaceholderPanelPage).toBe('function');
    if (typeof mod.PlaceholderPanelPage !== 'function') return;

    const markup = renderToStaticMarkup(React.createElement(mod.PlaceholderPanelPage, {
      title: 'Terminal',
      description: '세션 셸과 명령 실행 화면이 여기에 들어옵니다.',
    }));

    expect(markup).toContain('Terminal');
    expect(markup).toContain('세션 셸과 명령 실행 화면이 여기에 들어옵니다.');
    expect(markup).toContain('준비 중');
  });

  it('renders a back-to-chat escape hatch on placeholder pages', async () => {
    const mod = await loadPlaceholderPanelPageModule();

    expect(typeof mod.PlaceholderPanelPage).toBe('function');
    if (typeof mod.PlaceholderPanelPage !== 'function') return;

    const onReturnToChat = vi.fn();
    const tree = mod.PlaceholderPanelPage({
      title: 'Bookmark',
      description: '스크립트와 문서 바로가기가 여기에 들어옵니다.',
      onReturnToChat,
    });
    const backButton = flattenElements(tree).find((element) => {
      const text = renderToStaticMarkup(React.createElement(React.Fragment, null, element.props.children));
      return element.type === 'button' && text.includes('채팅으로 돌아가기');
    });

    expect(backButton).toBeTruthy();
    backButton?.props.onClick?.();
    expect(onReturnToChat).toHaveBeenCalledTimes(1);
  });

  it('renders a dedicated preview panel page for preview panels', async () => {
    const mod = await loadPanelPageRendererModule();

    expect(typeof mod.PanelPageRenderer).toBe('function');
    if (typeof mod.PanelPageRenderer !== 'function') return;

    const markup = renderToStaticMarkup(React.createElement(mod.PanelPageRenderer, {
      sessionId: 'session-1',
      projectName: '/workspace',
      workspaceRootPath: '/workspace',
      panel: {
        id: 'panel-preview-1',
        type: 'preview',
        title: 'Preview',
        config: { port: 3305, path: '/' },
        createdAt: '2026-04-16T00:00:00.000Z',
      },
      isMobileLayout: false,
      onSavePanel: vi.fn(async () => {}),
      onDeletePanel: vi.fn(async () => {}),
      onReturnToChat: vi.fn(),
    }));

    expect(markup).toContain('로컬 개발서버');
    expect(markup).toContain('포트');
    expect(markup).toContain('채팅으로 돌아가기');
    expect(markup).not.toContain('준비 중');
  });

  it('renders a workspace tools panel for explorer pages', async () => {
    const mod = await loadPanelPageRendererModule();

    expect(typeof mod.PanelPageRenderer).toBe('function');
    if (typeof mod.PanelPageRenderer !== 'function') return;

    const markup = renderToStaticMarkup(React.createElement(mod.PanelPageRenderer, {
      sessionId: 'session-1',
      projectName: '/workspace',
      workspaceRootPath: '/workspace',
      panel: {
        id: 'panel-workspace-1',
        type: 'explorer',
        title: 'Workspace',
        config: {},
        createdAt: '2026-04-16T00:00:00.000Z',
      },
      requestedFile: {
        path: '/workspace/src/app.tsx',
        nonce: 7,
      },
      isMobileLayout: false,
      onReturnToChat: vi.fn(),
    }));

    expect(markup).toContain('Workspace Tools Mock');
    expect(markup).not.toContain('준비 중');
  });
});
