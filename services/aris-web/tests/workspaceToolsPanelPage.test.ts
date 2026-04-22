import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceToolsPanelPage } from '@/app/sessions/[sessionId]/workspace-panels/WorkspaceToolsPanelPage';
import { CustomizationSidebar } from '@/app/sessions/[sessionId]/CustomizationSidebar';

vi.mock('@/app/sessions/[sessionId]/CustomizationSidebar', () => ({
  CustomizationSidebar: vi.fn(() => React.createElement('div', { 'data-testid': 'workspace-tools-sidebar' })),
}));

const mockedCustomizationSidebar = vi.mocked(CustomizationSidebar);

describe('WorkspaceToolsPanelPage', () => {
  it('forwards workspace-tool props into the shared CustomizationSidebar surface', () => {
    mockedCustomizationSidebar.mockClear();

    renderToStaticMarkup(React.createElement(WorkspaceToolsPanelPage, {
      sessionId: 'session-1',
      panel: {
        id: 'panel-workspace-1',
        type: 'explorer',
        title: 'Workspace',
        config: {},
        createdAt: '2026-04-16T00:00:00.000Z',
      },
      projectName: '/workspace',
      workspaceRootPath: '/workspace',
      requestedFile: {
        path: '/workspace/src/app.tsx',
        line: 42,
        nonce: 9,
      },
      isMobileLayout: true,
      onReturnToChat: vi.fn(),
    }));

    expect(mockedCustomizationSidebar).toHaveBeenCalledTimes(1);
    expect(mockedCustomizationSidebar).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-1',
        projectName: '/workspace',
        workspaceRootPath: '/workspace',
        requestedFile: {
          path: '/workspace/src/app.tsx',
          line: 42,
          nonce: 9,
        },
        mode: 'mobile',
        onRequestClose: expect.any(Function),
      }),
      undefined,
    );
  });
});
