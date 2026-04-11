import { describe, expect, it } from 'vitest';
import { buildOptimisticUserEvent } from '@/app/sessions/[sessionId]/chatComposer';

describe('buildOptimisticUserEvent', () => {
  it('creates a user message event that can render immediately in the chat timeline', () => {
    const event = buildOptimisticUserEvent({
      chatId: 'chat-1',
      agent: 'codex',
      model: 'gpt-5.4',
      text: 'hello world',
      submittedAt: '2026-04-03T01:00:00.000Z',
    });

    expect(event).toMatchObject({
      kind: 'text_reply',
      title: 'User Instruction',
      body: 'hello world',
      timestamp: '2026-04-03T01:00:00.000Z',
      meta: {
        role: 'user',
        chatId: 'chat-1',
        agent: 'codex',
        model: 'gpt-5.4',
      },
    });
  });

  it('keeps image attachments on the optimistic user event meta', () => {
    const event = buildOptimisticUserEvent({
      chatId: 'chat-1',
      agent: 'codex',
      model: 'gpt-5.4',
      text: '이미지 확인해줘',
      submittedAt: '2026-04-11T09:00:00.000Z',
      attachments: [
        {
          assetId: 'asset-1',
          kind: 'image',
          name: 'screen.png',
          mimeType: 'image/png',
          size: 1200,
          serverPath: '/home/ubuntu/.aris/chat-assets/session-1/asset-1-screen.png',
          previewUrl: '/api/fs/raw?path=%2Fhome%2Fubuntu%2F.aris%2Fchat-assets%2Fsession-1%2Fasset-1-screen.png',
        },
      ],
    });

    expect(event.meta?.attachments).toEqual([
      expect.objectContaining({
        assetId: 'asset-1',
        kind: 'image',
        name: 'screen.png',
      }),
    ]);
  });
});
