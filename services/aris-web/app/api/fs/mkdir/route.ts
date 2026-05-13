import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { requireApiUser } from '@/lib/auth/guard';
import { resolveFsBodyPath, workspacePanelTargetErrorResponse } from '@/lib/fs/requestPath';

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;
  if (auth.user.role !== 'operator') return NextResponse.json({ error: 'Operator role required' }, { status: 403 });

  try {
    const body = await request.json() as Record<string, unknown>;
    const dirPath = typeof body.path === 'string' ? body.path : '';
    if (!dirPath) return NextResponse.json({ error: 'Path required' }, { status: 400 });

    const { runtimePath } = await resolveFsBodyPath({
      body,
      userId: auth.user.id,
      requestedPath: dirPath,
    });

    await fs.mkdir(runtimePath, { recursive: true });

    return NextResponse.json({ success: true });
  } catch (error) {
    const response = workspacePanelTargetErrorResponse(error);
    return response ?? NextResponse.json({ error: 'Failed to create directory' }, { status: 500 });
  }
}
