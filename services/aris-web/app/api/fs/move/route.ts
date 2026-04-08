import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import { resolveFsPath } from '@/lib/fs/pathResolver';

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;
  if (auth.user.role !== 'operator') return NextResponse.json({ error: 'Operator role required' }, { status: 403 });

  try {
    const { oldPath, newPath } = await request.json();
    if (!oldPath || !newPath) return NextResponse.json({ error: 'Both oldPath and newPath are required' }, { status: 400 });

    const { runtimePath: fullOldPath } = resolveFsPath(oldPath);
    const { runtimePath: fullNewPath } = resolveFsPath(newPath);

    // Ensure parent directory of new path exists
    await fs.mkdir(path.dirname(fullNewPath), { recursive: true });
    
    await fs.rename(fullOldPath, fullNewPath);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error('File move error:', err);
    return NextResponse.json({ error: 'Failed to move/rename file' }, { status: 500 });
  }
}
