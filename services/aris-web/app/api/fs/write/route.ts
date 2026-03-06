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
    const { path: filePath, content } = await request.json();
    if (!filePath) return NextResponse.json({ error: 'Path required' }, { status: 400 });

    const normalizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
    let fullPath = path.join(WORKSPACE_ROOT, normalizedPath);

    // Development fallback check
    if (env.NODE_ENV !== 'production') {
      try {
        await fs.access(WORKSPACE_ROOT);
      } catch {
        fullPath = path.join(process.cwd(), normalizedPath);
      }
    }

    // Ensure parent directory exists
    await fs.mkdir(path.dirname(fullPath), { recursive: true });
    await fs.writeFile(fullPath, content || '', 'utf8');

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: 'Failed to write file' }, { status: 500 });
  }
}
