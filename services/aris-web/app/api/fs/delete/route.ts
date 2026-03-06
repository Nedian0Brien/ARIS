import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import { env } from '@/lib/config';

const WORKSPACE_ROOT = '/workspace';

export async function DELETE(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;
  if (auth.user.role !== 'operator') return NextResponse.json({ error: 'Operator role required' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const targetPath = searchParams.get('path');
  if (!targetPath || targetPath === '/' || targetPath === '.') {
    return NextResponse.json({ error: 'Valid path required' }, { status: 400 });
  }

  const normalizedPath = path.normalize(targetPath).replace(/^(\.\.[\/\\])+/, '');
  let fullPath = path.join(WORKSPACE_ROOT, normalizedPath);

  // Development fallback check
  if (env.NODE_ENV !== 'production') {
    try {
      await fs.access(WORKSPACE_ROOT);
    } catch {
      fullPath = path.join(process.cwd(), normalizedPath);
    }
  }

  try {
    await fs.rm(fullPath, { recursive: true, force: true });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to delete path' }, { status: 500 });
  }
}
