import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { WorkspaceToolsPanelPage } from '@/app/sessions/[sessionId]/workspace-panels/WorkspaceToolsPanelPage';
import { WorkspaceShell } from '@/app/sessions/[sessionId]/workspace-panels/WorkspaceShell';

vi.mock('@/app/sessions/[sessionId]/workspace-panels/WorkspaceShell', () => ({
  WorkspaceShell: vi.fn(() => React.createElement('div', { 'data-testid': 'workspace-shell' })),
}));

const mockedWorkspaceShell = vi.mocked(WorkspaceShell);

describe('WorkspaceToolsPanelPage', () => {
  it('forwards workspace-tool props into the Workspace shell surface', () => {
    mockedWorkspaceShell.mockClear();

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

    expect(mockedWorkspaceShell).toHaveBeenCalledTimes(1);
    expect(mockedWorkspaceShell).toHaveBeenCalledWith(
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

  it('uses desktop mode for workspace tools panels on non-mobile layouts', () => {
    mockedWorkspaceShell.mockClear();

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
      requestedFile: null,
      isMobileLayout: false,
      onReturnToChat: vi.fn(),
    }));

    expect(mockedWorkspaceShell).toHaveBeenCalledTimes(1);
    expect(mockedWorkspaceShell).toHaveBeenCalledWith(
      expect.objectContaining({
        mode: 'desktop',
        onRequestClose: expect.any(Function),
      }),
      undefined,
    );
  });
});
