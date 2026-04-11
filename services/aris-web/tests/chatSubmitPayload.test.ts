import { describe, expect, it } from 'vitest';
import { buildComposerSubmitText, buildUserMessageMeta, matchesSubmittedUserPayload } from '@/app/sessions/[sessionId]/chatSubmitPayload';

const attachments = [
  {
    assetId: 'asset-1',
    kind: 'image' as const,
    name: 'screen.png',
    mimeType: 'image/png',
    size: 1200,
    serverPath: '/home/ubuntu/.aris/chat-assets/session-1/asset-1-screen.png',
    previewUrl: '/api/fs/raw?path=%2Fhome%2Fubuntu%2F.aris%2Fchat-assets%2Fsession-1%2Fasset-1-screen.png',
  },
];

describe('chatSubmitPayload helpers', () => {
  it('prepends image attachment blocks before the prompt text', () => {
    const text = buildComposerSubmitText({
      promptText: '이미지 확인해줘',
      imageAttachments: attachments,
      contextBlocks: [{ type: 'text', text: '추가 맥락' }],
    });

    expect(text).toContain('<image_attachment assetId="asset-1"');
    expect(text).toContain('첨부 이미지를 참고해서 답변하라.');
    expect(text.endsWith('이미지 확인해줘')).toBe(true);
  });

  it('keeps attachments on the user message meta for submit and retry flows', () => {
    expect(buildUserMessageMeta({
      chatId: 'chat-1',
      agent: 'codex',
      model: 'gpt-5.4',
      attachments,
    })).toMatchObject({
      chatId: 'chat-1',
      agent: 'codex',
      attachments,
    });
  });

  it('matches persisted user events against the last submitted payload', () => {
    expect(matchesSubmittedUserPayload({
      id: 'evt-1',
      timestamp: '2026-04-11T09:00:00.000Z',
      kind: 'text_reply',
      title: 'User Instruction',
      body: 'hello',
      meta: {
        role: 'user',
        attachments,
      },
    }, {
      text: 'hello',
      attachments,
    })).toBe(true);
  });
});
