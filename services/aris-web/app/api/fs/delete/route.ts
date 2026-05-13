import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { requireApiUser } from '@/lib/auth/guard';
import { resolveFsRequestPath, workspacePanelTargetErrorResponse } from '@/lib/fs/requestPath';

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;
  if (auth.user.role !== 'operator') return NextResponse.json({ error: 'Operator role required' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get('path');
  if (!targetPath || targetPath === '/' || targetPath === '.') {
    return NextResponse.json({ error: 'Valid path required' }, { status: 400 });
  }

  let runtimePath: string;
  try {
    ({ runtimePath } = await resolveFsRequestPath({
      request,
      userId: auth.user.id,
      requestedPath: targetPath,
    }));
  } catch (error) {
    const response = workspacePanelTargetErrorResponse(error);
    return response ?? NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid path' }, { status: 400 });
  }

  try {
    await fs.rm(runtimePath, { recursive: true, force: true });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete path' }, { status: 500 });
  }
}
