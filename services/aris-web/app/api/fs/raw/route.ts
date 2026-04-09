import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import { resolveFsPath } from '@/lib/fs/pathResolver';

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  webp: 'image/webp',
};

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;
  if (auth.user.role !== 'operator') return NextResponse.json({ error: 'Operator role required' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'Path required' }, { status: 400 });

  const { runtimePath } = resolveFsPath(filePath);

  try {
    const stat = await fs.stat(runtimePath);
    if (!stat.isFile()) return NextResponse.json({ error: 'Not a file' }, { status: 400 });

    const ext = path.extname(runtimePath).slice(1).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    const content = await fs.readFile(runtimePath);

    return new NextResponse(content, {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': 'inline',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
