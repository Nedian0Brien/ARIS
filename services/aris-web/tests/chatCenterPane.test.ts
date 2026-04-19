import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { ChatCenterPane } from '@/app/sessions/[sessionId]/chat-screen/center-pane/ChatCenterPane';

describe('chat center pane view', () => {
  it('renders the center frame shell and forwards the main content slots', () => {
    const onJumpToBottom = vi.fn();
    const markup = renderToStaticMarkup(
      React.createElement(ChatCenterPane, {
        isMobileLayout: true,
        activeChatIdResolved: 'chat-1',
        isWorkspaceHome: false,
        isNewChatPlaceholder: false,
        showChatTransitionLoading: false,
        showScrollToBottom: true,
        onJumpToBottom,
        header: React.createElement('div', null, 'Header slot'),
        statusNotices: React.createElement('div', null, 'Notice slot'),
        chatBody: React.createElement('div', null, 'Body slot'),
        composer: React.createElement('div', null, 'Composer slot'),
        transitionOverlay: React.createElement('div', null, 'Overlay slot'),
      }),
    );

    expect(markup).toContain('centerFrame');
    expect(markup).toContain('centerFrameMobileScroll');
    expect(markup).toContain('Header slot');
    expect(markup).toContain('Notice slot');
    expect(markup).toContain('Body slot');
    expect(markup).toContain('Composer slot');
    expect(markup).toContain('Overlay slot');
    expect(markup).toContain('맨 아래로 이동');
  });

  it('hides the scroll affordance when there is no active chat or the home placeholder is visible', () => {
    const noChatMarkup = renderToStaticMarkup(
      React.createElement(ChatCenterPane, {
        isMobileLayout: false,
        activeChatIdResolved: null,
        isWorkspaceHome: false,
        isNewChatPlaceholder: false,
        showChatTransitionLoading: false,
        showScrollToBottom: true,
        onJumpToBottom: vi.fn(),
        header: null,
        statusNotices: null,
        chatBody: React.createElement('div', null, 'Body slot'),
        composer: null,
        transitionOverlay: null,
      }),
    );
    const homeMarkup = renderToStaticMarkup(
      React.createElement(ChatCenterPane, {
        isMobileLayout: false,
        activeChatIdResolved: 'chat-1',
        isWorkspaceHome: true,
        isNewChatPlaceholder: false,
        showChatTransitionLoading: false,
        showScrollToBottom: true,
        onJumpToBottom: vi.fn(),
        header: null,
        statusNotices: null,
        chatBody: React.createElement('div', null, 'Body slot'),
        composer: null,
        transitionOverlay: null,
      }),
    );

    expect(noChatMarkup).not.toContain('맨 아래로 이동');
    expect(homeMarkup).not.toContain('맨 아래로 이동');
  });
});
