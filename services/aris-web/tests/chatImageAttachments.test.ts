import { describe, expect, it } from 'vitest';
import {
  buildImageAttachmentPromptPrefix,
  readChatImageAttachments,
  stripImageAttachmentPromptPrefix,
} from '@/lib/chatImageAttachments';

describe('chatImageAttachments helpers', () => {
  it('builds an image prompt prefix with serverPath references in input order', () => {
    expect(buildImageAttachmentPromptPrefix([
      {
        assetId: 'asset-1',
        kind: 'image',
        name: 'screen.png',
        mimeType: 'image/png',
        size: 1200,
        serverPath: '/tmp/aris/session-1/chat-1/asset-1-screen.png',
        previewUrl: '/api/runtime/sessions/session-1/assets/images/asset-1',
      },
      {
        assetId: 'asset-2',
        kind: 'image',
        name: 'details.jpg',
        mimeType: 'image/jpeg',
        size: 2400,
        serverPath: '/tmp/aris/session-1/chat-1/asset-2-details.jpg',
        previewUrl: '/api/runtime/sessions/session-1/assets/images/asset-2',
      },
    ])).toBe([
      '<image_attachment assetId="asset-1" serverPath="/tmp/aris/session-1/chat-1/asset-1-screen.png" mimeType="image/png">',
      '첨부 이미지를 참고해서 답변하라.',
      '</image_attachment>',
      '',
      '<image_attachment assetId="asset-2" serverPath="/tmp/aris/session-1/chat-1/asset-2-details.jpg" mimeType="image/jpeg">',
      '첨부 이미지를 참고해서 답변하라.',
      '</image_attachment>',
      '',
      '',
    ].join('\n'));
  });

  it('returns an empty string when there are no attachments', () => {
    expect(buildImageAttachmentPromptPrefix([])).toBe('');
  });

  it('ends with a blank-line separator so callers can concatenate message text safely', () => {
    expect(buildImageAttachmentPromptPrefix([
      {
        assetId: 'asset-1',
        kind: 'image',
        name: 'screen.png',
        mimeType: 'image/png',
        size: 1200,
        serverPath: '/tmp/aris/session-1/chat-1/asset-1-screen.png',
        previewUrl: '/api/runtime/sessions/session-1/assets/images/asset-1',
      },
    ]).endsWith('\n\n')).toBe(true);
  });

  it('returns only valid image attachments from arbitrary meta payloads', () => {
    expect(readChatImageAttachments({
      attachments: [
        {
          assetId: 'asset-1',
          kind: 'image',
          name: 'screen.png',
          mimeType: 'image/png',
          size: '1200',
          width: '1280',
          height: 720,
          serverPath: '/tmp/a.png',
          previewUrl: '/api/x',
        },
        { kind: 'file' },
      ],
    })).toEqual([
      {
        assetId: 'asset-1',
        kind: 'image',
        name: 'screen.png',
        mimeType: 'image/png',
        size: 1200,
        width: 1280,
        height: 720,
        serverPath: '/tmp/a.png',
        previewUrl: '/api/x',
      },
    ]);
  });

  it('escapes line breaks in prompt attributes so the tag stays on one line', () => {
    expect(buildImageAttachmentPromptPrefix([
      {
        assetId: 'asset-1',
        kind: 'image',
        name: 'screen.png',
        mimeType: 'image/png',
        size: 1200,
        serverPath: '/tmp/aris/session-1/chat-1/asset-1-screen\nline.png',
        previewUrl: '/api/runtime/sessions/session-1/assets/images/asset-1',
      },
    ])).toContain('serverPath="/tmp/aris/session-1/chat-1/asset-1-screen&#10;line.png"');
  });

  it('rejects malformed numeric values instead of partially coercing them', () => {
    expect(readChatImageAttachments({
      attachments: [
        {
          assetId: 'asset-1',
          kind: 'image',
          name: 'screen.png',
          mimeType: 'image/png',
          size: '12px',
          width: '1e2',
          height: 1.9,
          serverPath: '/tmp/a.png',
          previewUrl: '/api/x',
        },
      ],
    })).toEqual([]);
  });

  it('rejects numeric strings outside the safe integer range', () => {
    expect(readChatImageAttachments({
      attachments: [
        {
          assetId: 'asset-1',
          kind: 'image',
          name: 'screen.png',
          mimeType: 'image/png',
          size: '9007199254740993',
          serverPath: '/tmp/a.png',
          previewUrl: '/api/x',
        },
      ],
    })).toEqual([]);
  });

  it('strips internal image attachment prompt blocks from visible user text', () => {
    const prefixed = `${buildImageAttachmentPromptPrefix([
      {
        assetId: 'asset-1',
        kind: 'image',
        name: 'screen.png',
        mimeType: 'image/png',
        size: 1200,
        serverPath: '/home/ubuntu/.aris/chat-assets/session-1/asset-1-screen.png',
        previewUrl: '/api/fs/raw?path=%2Fhome%2Fubuntu%2F.aris%2Fchat-assets%2Fsession-1%2Fasset-1-screen.png',
      },
    ])}실제 사용자 텍스트`;

    expect(stripImageAttachmentPromptPrefix(prefixed)).toBe('실제 사용자 텍스트');
  });

  it('returns an empty array for missing or invalid meta payloads', () => {
    expect(readChatImageAttachments(undefined)).toEqual([]);
    expect(readChatImageAttachments({ attachments: 'invalid' })).toEqual([]);
    expect(readChatImageAttachments({
      attachments: [
        {
          assetId: 'asset-1',
          kind: 'image',
          name: 'screen.png',
        },
      ],
    })).toEqual([]);
  });
});
