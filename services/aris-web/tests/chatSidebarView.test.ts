import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ChatSidebarSection } from '@/app/sessions/[sessionId]/chat-screen/left-sidebar/ChatSidebarSection';

describe('chat sidebar view', () => {
  it('renders the section label, count, and optional history sentinel', () => {
    const markup = renderToStaticMarkup(
      React.createElement(
        ChatSidebarSection,
        {
          section: { key: 'history', label: '최근 채팅', totalCount: 3 },
          sectionIndex: 1,
          showInfiniteSentinel: true,
        },
        React.createElement('div', null, '채팅 항목'),
      ),
    );

    expect(markup).toContain('최근 채팅');
    expect(markup).toContain('3');
    expect(markup).toContain('채팅 항목');
    expect(markup).toContain('이전 채팅 불러오는 중');
  });
});
