import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacePanelsPane } from '@/app/sessions/[sessionId]/chat-screen/right-pane/WorkspacePanelsPane';

vi.mock('@/app/sessions/[sessionId]/workspace-panels/PanelPageRenderer', () => ({
  PanelPageRenderer: vi.fn(() => React.createElement('div', { 'data-testid': 'panel-page-renderer' }, 'Panel page')),
}));

describe('WorkspacePanelsPane', () => {
  it('renders an injected header above the panel stream content', () => {
    const markup = renderToStaticMarkup(React.createElement(WorkspacePanelsPane, {
      mode: 'panel',
      sessionId: 'session-1',
      projectName: '/workspace',
      workspaceRootPath: '/workspace',
      isMobileLayout: false,
      workspacePanelsError: null,
      workspacePanelsLoading: false,
      workspacePanelLayout: {
        version: 1,
        activePage: {
          kind: 'panel',
          panelId: 'panel-1',
        },
        panels: [
          {
            id: 'panel-1',
            type: 'explorer',
            title: 'Workspace',
            config: {},
            createdAt: '2026-04-23T00:00:00.000Z',
          },
        ],
      },
      header: React.createElement('header', { 'data-testid': 'chat-header' }, 'Chat header'),
      requestedFile: null,
      panelId: 'panel-1',
      onSavePanel: vi.fn(),
      onDeletePanel: vi.fn(),
      onReturnToChat: vi.fn(),
    }));

    expect(markup).toContain('data-testid="chat-header"');
    expect(markup).toContain('Chat header');
    expect(markup).toContain('data-testid="panel-page-renderer"');
  });
});
