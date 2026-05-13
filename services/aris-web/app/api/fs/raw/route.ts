import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import { resolveFsRequestPath, workspacePanelTargetErrorResponse } from '@/lib/fs/requestPath';

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

  let runtimePath: string;
  try {
    ({ runtimePath } = await resolveFsRequestPath({
      request,
      userId: auth.user.id,
      requestedPath: filePath,
    }));
  } catch (error) {
    const response = workspacePanelTargetErrorResponse(error);
    return response ?? NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid path' }, { status: 400 });
  }

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
