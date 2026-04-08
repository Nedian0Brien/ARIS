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
    const { path: filePath, content } = await request.json();
    if (!filePath) return NextResponse.json({ error: 'Path required' }, { status: 400 });

    const { runtimePath } = resolveFsPath(filePath);

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(runtimePath), { recursive: true });
    await fs.writeFile(runtimePath, content || '', 'utf8');

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}
