import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import { resolveFsBodyPath, workspacePanelTargetErrorResponse } from '@/lib/fs/requestPath';

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;
  if (auth.user.role !== 'operator') return NextResponse.json({ error: 'Operator role required' }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const oldPath = typeof body.oldPath === 'string' ? body.oldPath : '';
    const newPath = typeof body.newPath === 'string' ? body.newPath : '';
    if (!oldPath || !newPath) return NextResponse.json({ error: 'Both oldPath and newPath are required' }, { status: 400 });

    const { runtimePath: fullOldPath } = await resolveFsBodyPath({
      body,
      userId: auth.user.id,
      requestedPath: oldPath,
    });
    const { runtimePath: fullNewPath } = await resolveFsBodyPath({
      body,
      userId: auth.user.id,
      requestedPath: newPath,
    });

    // Ensure parent directory of new path exists
    await fs.mkdir(path.dirname(fullNewPath), { recursive: true });
    
    await fs.rename(fullOldPath, fullNewPath);

    return NextResponse.json({ success: true });
  } catch (err) {
    const response = workspacePanelTargetErrorResponse(err);
    if (response) return response;
    console.error('File move error:', err);
    return NextResponse.json({ error: 'Failed to move/rename file' }, { status: 500 });
  }
}
