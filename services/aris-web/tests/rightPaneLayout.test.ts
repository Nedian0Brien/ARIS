import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RightPaneLayout } from '@/app/sessions/[sessionId]/chat-screen/right-pane/RightPaneLayout';
import { CustomizationSidebarContainer } from '@/app/sessions/[sessionId]/chat-screen/right-pane/CustomizationSidebarContainer';

vi.mock('@/app/sessions/[sessionId]/chat-screen/right-pane/CustomizationSidebarContainer', () => ({
  CustomizationSidebarContainer: vi.fn(() => null),
}));

const mockedCustomizationSidebarContainer = vi.mocked(CustomizationSidebarContainer);

describe('right pane layout view', () => {
  afterEach(() => {
    mockedCustomizationSidebarContainer.mockClear();
  });

  it('renders the overlay drawer close surface and mobile customization props', () => {
    const markup = renderToStaticMarkup(
      React.createElement(RightPaneLayout, {
        sessionId: 'session-1',
        projectName: 'Project One',
        normalizedWorkspaceRootPath: '/workspace',
        isMobileLayout: true,
        isCustomizationOverlayLayout: true,
        isCustomizationSidebarOpen: true,
        isCustomizationPinned: true,
        sidebarFileRequest: { path: '/workspace/src/app.tsx', nonce: 7 },
        onToggleCustomizationPinned: vi.fn(),
        onCloseCustomizationSidebar: vi.fn(),
      }),
    );

    expect(markup).toContain('Customization 패널 닫기');
    expect(markup).toContain('aria-hidden="false"');
    expect(mockedCustomizationSidebarContainer).toHaveBeenCalledTimes(2);

    expect(mockedCustomizationSidebarContainer).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        sessionId: 'session-1',
        projectName: 'Project One',
        workspaceRootPath: '/workspace',
        requestedFile: { path: '/workspace/src/app.tsx', nonce: 7 },
        isPinned: true,
        mode: 'mobile',
        onTogglePinned: expect.any(Function),
        onRequestClose: expect.any(Function),
      }),
      undefined,
    );

    expect(mockedCustomizationSidebarContainer).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        sessionId: 'session-1',
        projectName: 'Project One',
        workspaceRootPath: '/workspace',
        requestedFile: null,
        isPinned: true,
        mode: 'desktop',
        onTogglePinned: expect.any(Function),
      }),
      undefined,
    );
  });

  it('renders the desktop customization props when overlay mode is off', () => {
    const markup = renderToStaticMarkup(
      React.createElement(RightPaneLayout, {
        sessionId: 'session-2',
        projectName: 'Project Two',
        normalizedWorkspaceRootPath: '/workspace-two',
        isMobileLayout: false,
        isCustomizationOverlayLayout: false,
        isCustomizationSidebarOpen: false,
        isCustomizationPinned: false,
        sidebarFileRequest: { path: '/workspace-two/src/main.ts', nonce: 9 },
        onToggleCustomizationPinned: vi.fn(),
        onCloseCustomizationSidebar: vi.fn(),
      }),
    );

    expect(markup).toContain('class="');
    expect(mockedCustomizationSidebarContainer).toHaveBeenCalledTimes(1);
    expect(mockedCustomizationSidebarContainer).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionId: 'session-2',
        projectName: 'Project Two',
        workspaceRootPath: '/workspace-two',
        requestedFile: { path: '/workspace-two/src/main.ts', nonce: 9 },
        isPinned: false,
        mode: 'desktop',
        onTogglePinned: expect.any(Function),
      }),
      undefined,
    );
  });
});
