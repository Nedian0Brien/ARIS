import { describe, expect, it } from 'vitest';
import type { ChatImageAttachment } from '@/lib/happy/types';
import {
  buildImageAttachmentPromptPrefix,
  readChatImageAttachments,
} from '@/lib/chatImageAttachments';

describe('buildImageAttachmentPromptPrefix', () => {
  it('renders image attachments in input order with blank lines between blocks', () => {
    const attachments: ChatImageAttachment[] = [
      {
        assetId: 'asset-1',
        kind: 'image',
        name: 'first.png',
        mimeType: 'image/png',
        size: 123,
        width: 640,
        height: 480,
        serverPath: '/files/first.png',
        previewUrl: 'https://example.com/first.png',
      },
      {
        assetId: 'asset-2',
        kind: 'image',
        name: 'second.jpg',
        mimeType: 'image/jpeg',
        size: 456,
        serverPath: '/files/second.jpg',
        previewUrl: 'https://example.com/second.jpg',
      },
    ];

    expect(buildImageAttachmentPromptPrefix(attachments)).toBe(
      '<image_attachment assetId="asset-1" name="first.png" mimeType="image/png" size="123" width="640" height="480" serverPath="/files/first.png" previewUrl="https://example.com/first.png" />\n\n'
      + '<image_attachment assetId="asset-2" name="second.jpg" mimeType="image/jpeg" size="456" serverPath="/files/second.jpg" previewUrl="https://example.com/second.jpg" />'
    );
  });

  it('returns an empty string for no attachments', () => {
    expect(buildImageAttachmentPromptPrefix([])).toBe('');
  });
});

describe('readChatImageAttachments', () => {
  it('returns only valid image attachments and normalizes their shape', () => {
    const meta = {
      attachments: [
        null,
        undefined,
        { kind: 'file', assetId: 'skip-me' },
        {
          assetId: 'asset-3',
          kind: 'image',
          name: 'third.webp',
          mimeType: 'image/webp',
          size: '789',
          width: '1280',
          height: 720,
          serverPath: '/files/third.webp',
          previewUrl: 'https://example.com/third.webp',
        },
      ],
    };

    expect(readChatImageAttachments(meta)).toEqual([
      {
        assetId: 'asset-3',
        kind: 'image',
        name: 'third.webp',
        mimeType: 'image/webp',
        size: 789,
        width: 1280,
        height: 720,
        serverPath: '/files/third.webp',
        previewUrl: 'https://example.com/third.webp',
      },
    ]);
  });

  it('returns an empty array when meta is missing or attachments are invalid', () => {
    expect(readChatImageAttachments(undefined)).toEqual([]);
    expect(readChatImageAttachments({ attachments: [{ kind: 'image', assetId: 123 }] })).toEqual([]);
  });
});
