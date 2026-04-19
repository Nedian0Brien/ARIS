import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { UiEvent } from '@/lib/happy/types';
import { buildImageAttachmentPromptPrefix } from '@/lib/chatImageAttachments';
import { LastUserMessageJumpBar } from '@/app/sessions/[sessionId]/chat-screen/center-pane/LastUserMessageJumpBar';
import {
  resolveLastPassedUserMessageJumpTarget,
  resolveUserMessageJumpTargets,
  shouldShowLastUserMessageJumpBar,
} from '@/app/sessions/[sessionId]/chat-screen/center-pane/lastUserMessageBar';

function buildEvent(overrides: Partial<UiEvent> = {}): UiEvent {
  return {
    id: overrides.id ?? 'event-1',
    timestamp: overrides.timestamp ?? '2026-04-19T10:00:00.000Z',
    kind: overrides.kind ?? 'text_reply',
    title: overrides.title ?? 'Message',
    body: overrides.body ?? 'hello',
    ...(overrides.meta ? { meta: overrides.meta } : {}),
  };
}

describe('last user message jump bar', () => {
  it('builds jump targets for each user-authored message with compact preview text', () => {
    const targets = resolveUserMessageJumpTargets([
      buildEvent({
        id: 'agent-1',
        timestamp: '2026-04-19T10:00:01.000Z',
        body: '답변',
        meta: { role: 'agent' },
      }),
      buildEvent({
        id: 'user-1',
        timestamp: '2026-04-19T10:00:02.000Z',
        title: 'User Prompt',
        body: '첫 줄 요약\n둘째 줄은 잘라도 됩니다.',
        meta: { role: 'user' },
      }),
    ]);

    expect(targets).toEqual([{
      eventId: 'user-1',
      preview: '첫 줄 요약',
      timestamp: '2026-04-19T10:00:02.000Z',
    }]);
  });

  it('strips internal image prompt prefixes and falls back to an attachment label when text is empty', () => {
    const prefixedBody = buildImageAttachmentPromptPrefix([
      {
        assetId: 'asset-1',
        kind: 'image',
        name: 'screen.png',
        mimeType: 'image/png',
        size: 1200,
        serverPath: '/tmp/screen.png',
        previewUrl: '/api/fs/raw?path=%2Ftmp%2Fscreen.png',
      },
    ]);

    const targets = resolveUserMessageJumpTargets([
      buildEvent({
        id: 'user-image',
        title: 'Image upload',
        body: prefixedBody,
        meta: {
          role: 'user',
          attachments: [
            {
              assetId: 'asset-1',
              kind: 'image',
              name: 'screen.png',
              mimeType: 'image/png',
              size: 1200,
              serverPath: '/tmp/screen.png',
              previewUrl: '/api/fs/raw?path=%2Ftmp%2Fscreen.png',
            },
          ],
        },
      }),
    ]);

    expect(targets).toEqual([{
      eventId: 'user-image',
      preview: '이미지 첨부',
      timestamp: '2026-04-19T10:00:00.000Z',
    }]);
  });

  it('selects the latest user message whose bubble has already moved above the scroll boundary', () => {
    const targets = resolveUserMessageJumpTargets([
      buildEvent({
        id: 'user-1',
        timestamp: '2026-04-19T10:00:01.000Z',
        body: '첫 메시지',
        meta: { role: 'user' },
      }),
      buildEvent({
        id: 'user-2',
        timestamp: '2026-04-19T10:00:02.000Z',
        body: '둘째 메시지',
        meta: { role: 'user' },
      }),
      buildEvent({
        id: 'user-3',
        timestamp: '2026-04-19T10:00:03.000Z',
        body: '셋째 메시지',
        meta: { role: 'user' },
      }),
    ]);

    expect(resolveLastPassedUserMessageJumpTarget({
      targets,
      scrollBoundary: 480,
      bubbleBottomByEventId: new Map([
        ['user-1', 160],
        ['user-2', 330],
        ['user-3', 481],
      ]),
    })).toEqual({
      eventId: 'user-2',
      preview: '둘째 메시지',
      timestamp: '2026-04-19T10:00:02.000Z',
    });
  });

  it('returns null when no user bubble has moved above the scroll boundary yet', () => {
    const targets = resolveUserMessageJumpTargets([
      buildEvent({
        id: 'user-1',
        timestamp: '2026-04-19T10:00:01.000Z',
        body: '첫 메시지',
        meta: { role: 'user' },
      }),
      buildEvent({
        id: 'user-2',
        timestamp: '2026-04-19T10:00:02.000Z',
        body: '둘째 메시지',
        meta: { role: 'user' },
      }),
    ]);

    expect(resolveLastPassedUserMessageJumpTarget({
      targets,
      scrollBoundary: 180,
      bubbleBottomByEventId: {
        'user-1': 181,
        'user-2': 420,
      },
    })).toBeNull();
  });

  it('shows the jump bar only while a passed target exists and the chat view is active', () => {
    expect(shouldShowLastUserMessageJumpBar({
      targetEventId: 'user-1',
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      showChatTransitionLoading: false,
    })).toBe(true);

    expect(shouldShowLastUserMessageJumpBar({
      targetEventId: null,
      isWorkspaceHome: false,
      isNewChatPlaceholder: false,
      showChatTransitionLoading: false,
    })).toBe(false);
  });

  it('renders a compact jump bar button with the preview text', () => {
    const markup = renderToStaticMarkup(
      React.createElement(LastUserMessageJumpBar, {
        preview: '방금 보낸 마지막 사용자 메시지',
        onJump: vi.fn(),
      }),
    );

    expect(markup).toContain('지난 사용자 메시지');
    expect(markup).toContain('방금 보낸 마지막 사용자 메시지');
    expect(markup).toContain('이동');
    expect(markup).toContain('button');
  });
});
