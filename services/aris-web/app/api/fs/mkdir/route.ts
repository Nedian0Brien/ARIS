import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import { requireApiUser } from '@/lib/auth/guard';
import { resolveFsPath } from '@/lib/fs/pathResolver';

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;
  if (auth.user.role !== 'operator') return NextResponse.json({ error: 'Operator role required' }, { status: 403 });

  try {
    const { path: dirPath } = await request.json();
    if (!dirPath) return NextResponse.json({ error: 'Path required' }, { status: 400 });

    const { runtimePath } = resolveFsPath(dirPath);

    await fs.mkdir(runtimePath, { recursive: true });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to create directory' }, { status: 500 });
  }
}
