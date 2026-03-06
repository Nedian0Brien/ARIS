import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import { env } from '@/lib/config';

const WORKSPACE_ROOT = '/workspace';

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;
  if (auth.user.role !== 'operator') return NextResponse.json({ error: 'Operator role required' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const filePath = searchParams.get('path');
  if (!filePath) return NextResponse.json({ error: 'Path required' }, { status: 400 });

  const normalizedPath = path.normalize(filePath).replace(/^(\.\.[\/\\])+/, '');
  let fullPath = path.join(WORKSPACE_ROOT, normalizedPath);

  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isFile()) return NextResponse.json({ error: 'Not a file' }, { status: 400 });
  } catch {
    if (env.NODE_ENV !== 'production') {
      fullPath = path.join(process.cwd(), normalizedPath);
    } else {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  }

  try {
    const content = await fs.readFile(fullPath, 'utf8');
    return NextResponse.json({ content });
  } catch {
    return NextResponse.json({ error: 'Failed to read file' }, { status: 500 });
  }
}
