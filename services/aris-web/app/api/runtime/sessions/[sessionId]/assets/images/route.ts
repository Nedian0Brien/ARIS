import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireApiUser } from '@/lib/auth/guard';
import { getHostHomeDir } from '@/lib/fs/pathResolver';
import type { ChatImageAttachment } from '@/lib/happy/types';

const CHAT_IMAGE_ASSET_ROOT = path.join(getHostHomeDir(), '.aris', 'chat-assets');

function sanitizeFilename(name: string): string {
  const base = path.basename(name).trim() || 'image';
  return base.replace(/[^\w.-]+/g, '-');
}

function buildAttachment(input: {
  sessionId: string;
  assetId: string;
  file: File;
}): ChatImageAttachment {
  const safeName = sanitizeFilename(input.file.name);
  const serverPath = path.join(CHAT_IMAGE_ASSET_ROOT, input.sessionId, `${input.assetId}-${safeName}`);
  return {
    assetId: input.assetId,
    kind: 'image',
    name: safeName,
    mimeType: input.file.type,
    size: input.file.size,
    serverPath,
    previewUrl: `/api/fs/raw?path=${encodeURIComponent(serverPath)}`,
  };
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { sessionId } = await params;
  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: '이미지 파일이 필요합니다.' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
  }

  const assetId = randomUUID();
  const attachment = buildAttachment({ sessionId, assetId, file });

  try {
    await fs.mkdir(path.dirname(attachment.serverPath), { recursive: true });
    await fs.writeFile(attachment.serverPath, Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : '이미지 저장에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ attachment });
}
