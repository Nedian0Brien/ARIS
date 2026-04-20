import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { WorkspacePagerShell } from '@/app/sessions/[sessionId]/chat-screen/center-pane/WorkspacePagerShell';
import { WorkspacePager } from '@/app/sessions/[sessionId]/workspace-panels/WorkspacePager';

vi.mock('@/app/sessions/[sessionId]/workspace-panels/WorkspacePager', () => ({
  WorkspacePager: vi.fn(() => null),
}));

const mockedWorkspacePager = vi.mocked(WorkspacePager);

describe('workspace pager shell view', () => {
  it('renders the shell wrapper and forwards pager props', () => {
    const centerPanelRef = { current: null };
    const workspacePagerItems = [
      { id: 'chat', kind: 'chat' },
      { id: 'create-panel', kind: 'create-panel' },
    ] as const;
    const onActivePageChange = vi.fn();
    const renderChatPage = vi.fn(() => React.createElement('div', null, 'Chat page'));
    const renderCreatePage = vi.fn(() => React.createElement('div', null, 'Create page'));
    const renderPanelPage = vi.fn(() => React.createElement('div', null, 'Panel page'));

    const markup = renderToStaticMarkup(
      React.createElement(WorkspacePagerShell, {
        centerPanelRef,
        isMobileLayout: true,
        workspacePagerItems,
        activeWorkspacePageId: 'chat',
        setActiveWorkspacePageId: onActivePageChange,
        renderChatPage,
        renderCreatePage,
        renderPanelPage,
      }),
    );

    expect(markup).toContain('main');
    expect(markup).toContain('centerPanel');
    expect(markup).toContain('centerPanelMobileScroll');
    expect(mockedWorkspacePager).toHaveBeenCalledTimes(1);
    expect(mockedWorkspacePager).toHaveBeenCalledWith(
      expect.objectContaining({
        items: workspacePagerItems,
        activePageId: 'chat',
        onActivePageChange,
        renderChatPage,
        renderCreatePage,
        renderPanelPage,
      }),
      undefined,
    );
  });
});
