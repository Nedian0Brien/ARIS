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

  it('preserves image attachments in event meta for optimistic rendering', () => {
    const attachments = [
      {
        assetId: 'asset-1',
        kind: 'image',
        name: 'diagram.png',
        mimeType: 'image/png',
        size: 2048,
        serverPath: '/tmp/aris-runtime-assets/session-1/images/asset-1.png',
        previewUrl: '/api/fs/raw?path=%2Ftmp%2Faris-runtime-assets%2Fsession-1%2Fimages%2Fasset-1.png',
        width: 640,
        height: 480,
      },
    ] as const;

    const event = buildOptimisticUserEvent({
      chatId: 'chat-1',
      agent: 'codex',
      model: 'gpt-5.4',
      text: 'look at this',
      submittedAt: '2026-04-03T01:00:00.000Z',
      attachments: [...attachments],
    });

    expect(event.meta?.attachments).toEqual(attachments);
  });
});
