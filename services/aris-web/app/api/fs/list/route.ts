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
    
    const directories = entries
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: path.join(normalizedPath, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ 
      currentPath: normalizedPath, 
      parentPath: normalizedPath === '/' ? null : path.dirname(normalizedPath),
      directories 
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to read directory' }, { status: 500 });
  }
}
