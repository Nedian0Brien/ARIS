import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import { env } from '@/lib/config';

// Host projects root mapped inside the container as /workspace
const WORKSPACE_ROOT = '/workspace';

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path') || '/';

  // Prevent directory traversal attacks
  const normalizedPath = path.normalize(dirPath).replace(/^(\.\.[\/\\])+/, '');
  let fullPath = path.join(WORKSPACE_ROOT, normalizedPath);

  // In local dev, /workspace might not exist, fallback to process.cwd() or /tmp
  try {
    const stat = await fs.stat(fullPath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'Not a directory' }, { status: 400 });
    }
  } catch {
    // Fallback for dev environments where /workspace isn't mounted
    if (env.NODE_ENV !== 'production') {
      fullPath = path.join(process.cwd(), normalizedPath);
    } else {
      return NextResponse.json({ error: 'Directory not found' }, { status: 404 });
    }
  }

  try {
    const entries = await fs.readdir(fullPath, { withFileTypes: true });
    
    const items = entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: path.join(normalizedPath, entry.name),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile()
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json({ 
      currentPath: normalizedPath, 
      parentPath: normalizedPath === '/' ? null : path.dirname(normalizedPath),
      directories: items // 유지 호환성 또는 items로 클라이언트에서 처리. 일단 items를 보내지만 하위호환을 위해 items로 대체.
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read directory' }, { status: 500 });
  }
}
