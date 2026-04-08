import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { requireApiUser } from '@/lib/auth/guard';
import { resolveFsPath } from '@/lib/fs/pathResolver';

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;
  if (auth.user.role !== 'operator') return NextResponse.json({ error: 'Operator role required' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get('path');
  if (!targetPath || targetPath === '/' || targetPath === '.') {
    return NextResponse.json({ error: 'Valid path required' }, { status: 400 });
  }

  const { runtimePath } = resolveFsPath(targetPath);

  try {
    await fs.rm(runtimePath, { recursive: true, force: true });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete path' }, { status: 500 });
  }
}
