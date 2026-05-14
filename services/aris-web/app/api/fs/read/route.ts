import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { requireApiUser } from '@/lib/auth/guard';
import { resolveFsRequestPath, workspacePanelTargetErrorResponse } from '@/lib/fs/requestPath';

const MAX_PREVIEW_BYTES = 5 * 1024 * 1024;

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
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  try {
    const stat = await fs.stat(runtimePath);
    if (!stat.isFile()) {
      return NextResponse.json({ error: 'Not a file' }, { status: 400 });
    }

    if (stat.size > MAX_PREVIEW_BYTES) {
      return NextResponse.json({
        blockedReason: 'large',
        sizeBytes: stat.size,
      });
    }

    const contentBuffer = await fs.readFile(runtimePath);
    if (contentBuffer.includes(0)) {
      return NextResponse.json({
        blockedReason: 'binary',
        sizeBytes: stat.size,
      });
    }

    return NextResponse.json({
      content: contentBuffer.toString('utf8'),
      sizeBytes: stat.size,
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
