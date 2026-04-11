import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { requireApiUser } from '@/lib/auth/guard';
import { getHostHomeDir } from '@/lib/fs/pathResolver';
import type { ChatImageAttachment } from '@/lib/happy/types';

const CHAT_IMAGE_ASSET_ROOT = path.join(getHostHomeDir(), '.aris', 'chat-assets');
const MAX_IMAGE_UPLOAD_BYTES = 10 * 1024 * 1024;

function sanitizeFilename(name: string): string {
  const base = path.basename(name).trim() || 'image';
  return base.replace(/[^\w.-]+/g, '-');
}

function normalizeSessionSegment(sessionId: string): string | null {
  const trimmed = sessionId.trim();
  if (!trimmed || !/^[A-Za-z0-9._-]+$/.test(trimmed)) {
    return null;
  }
  if (trimmed === '.' || trimmed === '..') {
    return null;
  }
  return trimmed;
}

function buildAttachment(input: {
  sessionSegment: string;
  assetId: string;
  file: File;
}): ChatImageAttachment {
  const safeName = sanitizeFilename(input.file.name);
  const serverPath = path.join(CHAT_IMAGE_ASSET_ROOT, input.sessionSegment, `${input.assetId}-${safeName}`);
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
  const sessionSegment = normalizeSessionSegment(sessionId);
  if (!sessionSegment) {
    return NextResponse.json({ error: '유효하지 않은 세션 식별자입니다.' }, { status: 400 });
  }

  const contentLength = Number.parseInt(request.headers.get('content-length') ?? '', 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_UPLOAD_BYTES) {
    return NextResponse.json({ error: '이미지 파일은 10MB 이하만 업로드할 수 있습니다.' }, { status: 400 });
  }

  const formData = await request.formData().catch(() => null);
  const file = formData?.get('file');
  if (!(file instanceof File) || file.size <= 0) {
    return NextResponse.json({ error: '이미지 파일이 필요합니다.' }, { status: 400 });
  }

  if (!file.type.startsWith('image/')) {
    return NextResponse.json({ error: '이미지 파일만 업로드할 수 있습니다.' }, { status: 400 });
  }

  if (file.size > MAX_IMAGE_UPLOAD_BYTES) {
    return NextResponse.json({ error: '이미지 파일은 10MB 이하만 업로드할 수 있습니다.' }, { status: 400 });
  }

  const assetId = randomUUID();
  const attachment = buildAttachment({ sessionSegment, assetId, file });

  try {
    await fs.mkdir(path.dirname(attachment.serverPath), { recursive: true });
    await fs.writeFile(attachment.serverPath, Buffer.from(await file.arrayBuffer()));
  } catch (error) {
    const message = error instanceof Error ? error.message : '이미지 저장에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }

  return NextResponse.json({ attachment });
}
