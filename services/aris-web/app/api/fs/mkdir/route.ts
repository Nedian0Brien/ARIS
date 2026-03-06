import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import { env } from '@/lib/config';

const WORKSPACE_ROOT = '/workspace';

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;
  if (auth.user.role !== 'operator') return NextResponse.json({ error: 'Operator role required' }, { status: 403 });

  try {
    const { path: dirPath } = await request.json();
    if (!dirPath) return NextResponse.json({ error: 'Path required' }, { status: 400 });

    const normalizedPath = path.normalize(dirPath).replace(/^(\.\.[\/\\])+/, '');
    let fullPath = path.join(WORKSPACE_ROOT, normalizedPath);

    // Development fallback check
    if (env.NODE_ENV !== 'production') {
      try {
        await fs.access(WORKSPACE_ROOT);
      } catch {
        fullPath = path.join(process.cwd(), normalizedPath);
      }
    }

    await fs.mkdir(fullPath, { recursive: true });

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to create directory' }, { status: 500 });
  }
}
