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
    const filePath = typeof body.path === 'string' ? body.path : '';
    const content = typeof body.content === 'string' ? body.content : '';
    if (!filePath) return NextResponse.json({ error: 'Path required' }, { status: 400 });

    const { runtimePath } = await resolveFsBodyPath({
      body,
      userId: auth.user.id,
      requestedPath: filePath,
    });

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(runtimePath), { recursive: true });
    await fs.writeFile(runtimePath, content || '', 'utf8');

    return NextResponse.json({ success: true });
  } catch (error) {
    const response = workspacePanelTargetErrorResponse(error);
    return response ?? NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}
