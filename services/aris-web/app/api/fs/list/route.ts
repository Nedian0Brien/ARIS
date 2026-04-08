import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import { getDefaultBrowseRoot, resolveFsPath } from '@/lib/fs/pathResolver';

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const dirPath = searchParams.get('path');
  const { visiblePath, runtimePath } = resolveFsPath(dirPath);

  try {
    const stat = await fs.stat(runtimePath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'Not a directory' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Directory not found' }, { status: 404 });
  }

  try {
    const entries = await fs.readdir(runtimePath, { withFileTypes: true });
    
    const items = entries
      .filter((entry) => !entry.name.startsWith('.'))
      .map((entry) => ({
        name: entry.name,
        path: path.join(visiblePath, entry.name),
        isDirectory: entry.isDirectory(),
        isFile: entry.isFile()
      }))
      .sort((a, b) => {
        if (a.isDirectory && !b.isDirectory) return -1;
        if (!a.isDirectory && b.isDirectory) return 1;
        return a.name.localeCompare(b.name);
      });

    return NextResponse.json({ 
      currentPath: visiblePath, 
      parentPath: visiblePath === getDefaultBrowseRoot() ? null : path.dirname(visiblePath),
      directories: items // 유지 호환성 또는 items로 클라이언트에서 처리. 일단 items를 보내지만 하위호환을 위해 items로 대체.
    });
  } catch {
    return NextResponse.json({ error: 'Failed to read directory' }, { status: 500 });
  }
}
