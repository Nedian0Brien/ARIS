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
});
