import type { ChatImageAttachment } from '@/lib/happy/types';

function asObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asNonNegativeNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return Math.floor(value);
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return parsed;
    }
  }
  return undefined;
}

function asRequiredString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

export function buildImageAttachmentPromptPrefix(attachments: ChatImageAttachment[]): string {
  if (attachments.length === 0) {
    return '';
  }

  return attachments.map((attachment) => (
    [
      `<image_attachment assetId="${escapeXmlAttribute(attachment.assetId)}" serverPath="${escapeXmlAttribute(attachment.serverPath)}" mimeType="${escapeXmlAttribute(attachment.mimeType)}">`,
      '첨부 이미지를 참고해서 답변하라.',
      '</image_attachment>',
    ].join('\n')
  )).join('\n\n');
}

export function readChatImageAttachments(meta: Record<string, unknown> | null | undefined): ChatImageAttachment[] {
  const attachments = meta?.attachments;
  if (!Array.isArray(attachments)) {
    return [];
  }

  return attachments.flatMap((item) => {
    const record = asObject(item);
    if (!record) {
      return [];
    }

    const assetId = asRequiredString(record.assetId);
    const kind = asRequiredString(record.kind);
    const name = asRequiredString(record.name);
    const mimeType = asRequiredString(record.mimeType);
    const size = asNonNegativeNumber(record.size);
    const serverPath = asRequiredString(record.serverPath);
    const previewUrl = asRequiredString(record.previewUrl);

    if (!assetId || kind !== 'image' || !name || !mimeType || size === undefined || !serverPath || !previewUrl) {
      return [];
    }

    const width = asNonNegativeNumber(record.width);
    const height = asNonNegativeNumber(record.height);

    return [{
      assetId,
      kind: 'image' as const,
      name,
      mimeType,
      size,
      ...(width !== undefined ? { width } : {}),
      ...(height !== undefined ? { height } : {}),
      serverPath,
      previewUrl,
    }];
  });
}
