import type { ChatImageAttachment } from '@/lib/happy/types';

type AttachmentRecord = Record<string, unknown>;

function asRecord(value: unknown): AttachmentRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as AttachmentRecord;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asPositiveInteger(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return null;
}

function escapeAttributeValue(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function readChatImageAttachment(value: unknown): ChatImageAttachment | null {
  const record = asRecord(value);
  if (!record || record.kind !== 'image') {
    return null;
  }

  const assetId = asString(record.assetId);
  const name = asString(record.name);
  const mimeType = asString(record.mimeType);
  const size = asPositiveInteger(record.size);
  const serverPath = asString(record.serverPath);
  const previewUrl = asString(record.previewUrl);
  if (!assetId || !name || !mimeType || size === null || !serverPath || !previewUrl) {
    return null;
  }

  const width = asPositiveInteger(record.width);
  const height = asPositiveInteger(record.height);

  return {
    assetId,
    kind: 'image',
    name,
    mimeType,
    size,
    ...(width === null ? {} : { width }),
    ...(height === null ? {} : { height }),
    serverPath,
    previewUrl,
  };
}

export function buildImageAttachmentPromptPrefix(attachments: ChatImageAttachment[]): string {
  if (attachments.length === 0) {
    return '';
  }

  return attachments
    .map((attachment) => {
      const attrs = [
        `assetId="${escapeAttributeValue(attachment.assetId)}"`,
        `name="${escapeAttributeValue(attachment.name)}"`,
        `mimeType="${escapeAttributeValue(attachment.mimeType)}"`,
        `size="${attachment.size}"`,
        ...(attachment.width === undefined ? [] : [`width="${attachment.width}"`]),
        ...(attachment.height === undefined ? [] : [`height="${attachment.height}"`]),
        `serverPath="${escapeAttributeValue(attachment.serverPath)}"`,
        `previewUrl="${escapeAttributeValue(attachment.previewUrl)}"`,
      ].join(' ');
      return `<image_attachment ${attrs} />`;
    })
    .join('\n\n');
}

export function readChatImageAttachments(meta: unknown): ChatImageAttachment[] {
  const record = asRecord(meta);
  if (!record || !Array.isArray(record.attachments)) {
    return [];
  }

  return record.attachments.map(readChatImageAttachment).filter(
    (attachment): attachment is ChatImageAttachment => attachment !== null
  );
}
