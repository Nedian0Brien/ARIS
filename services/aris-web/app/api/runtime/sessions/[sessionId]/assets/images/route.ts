import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ChatImageAttachment = {
  assetId: string;
  kind: 'image';
  name: string;
  mimeType: string;
  size: number;
  serverPath: string;
  previewUrl: string;
  width?: number;
  height?: number;
};

const RUNTIME_ASSET_ROOT = path.join(tmpdir(), 'aris-runtime-assets');

function getSessionImageDir(sessionId: string): string {
  return path.join(RUNTIME_ASSET_ROOT, sessionId, 'images');
}

function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith('image/');
}

function sanitizeExtension(fileName: string, mimeType: string): string {
  const fromName = path.extname(fileName).trim().toLowerCase();
  if (fromName) {
    return fromName;
  }

  switch (mimeType) {
    case 'image/jpeg':
      return '.jpg';
    case 'image/png':
      return '.png';
    case 'image/gif':
      return '.gif';
    case 'image/webp':
      return '.webp';
    case 'image/svg+xml':
      return '.svg';
    default:
      return '';
  }
}

function readPngDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 24) return null;
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  if (!buffer.subarray(0, 8).equals(pngSignature)) return null;

  return {
    width: buffer.readUInt32BE(16),
    height: buffer.readUInt32BE(20),
  };
}

function resolveImageDimensions(buffer: Buffer, mimeType: string): { width?: number; height?: number } {
  if (mimeType === 'image/png') {
    const png = readPngDimensions(buffer);
    if (png) {
      return png;
    }
  }

  return {};
}

function buildPreviewUrl(serverPath: string): string {
  return `/api/fs/raw?path=${encodeURIComponent(serverPath)}`;
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form data' }, { status: 400 });
  }

  const uploadedFiles = formData.getAll('file');
  if (uploadedFiles.length !== 1) {
    return NextResponse.json({ error: 'File required' }, { status: 400 });
  }

  const file = uploadedFiles[0];
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'File required' }, { status: 400 });
  }

  if (!isImageMimeType(file.type)) {
    return NextResponse.json({ error: 'Only image files are supported' }, { status: 400 });
  }

  try {
    const { sessionId } = await context.params;
    const assetId = randomUUID();
    const imageDir = getSessionImageDir(sessionId);
    const extension = sanitizeExtension(file.name, file.type);
    const storedName = `${assetId}${extension}`;
    const serverPath = path.join(imageDir, storedName);
    const bytes = Buffer.from(await file.arrayBuffer());

    await fs.mkdir(imageDir, { recursive: true });
    await fs.writeFile(serverPath, bytes);

    const dimensions = resolveImageDimensions(bytes, file.type);
    const attachment: ChatImageAttachment = {
      assetId,
      kind: 'image',
      name: file.name,
      mimeType: file.type,
      size: file.size,
      serverPath,
      previewUrl: buildPreviewUrl(serverPath),
      ...dimensions,
    };

    return NextResponse.json(attachment);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Failed to store image',
      },
      { status: 500 },
    );
  }
}
