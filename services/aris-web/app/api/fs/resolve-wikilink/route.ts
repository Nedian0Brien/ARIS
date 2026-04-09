import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import { resolveFsPath } from '@/lib/fs/pathResolver';

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;
  if (auth.user.role !== 'operator') return NextResponse.json({ error: 'Operator role required' }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const wikilinkPath = searchParams.get('path');
  const fromFile = searchParams.get('from');

  if (!wikilinkPath) return NextResponse.json({ error: 'path required' }, { status: 400 });

  // 확장자가 없으면 .md 추가
  const pathWithExt = wikilinkPath.includes('.') ? wikilinkPath : `${wikilinkPath}.md`;

  if (!fromFile) {
    return NextResponse.json({ resolvedPath: null });
  }

  let fromRuntimePath: string;
  try {
    const resolved = resolveFsPath(fromFile);
    fromRuntimePath = resolved.runtimePath;
  } catch {
    return NextResponse.json({ resolvedPath: null });
  }

  // 현재 파일의 디렉터리부터 루트까지 올라가며 탐색
  let dir = path.dirname(fromRuntimePath);
  const visited = new Set<string>();

  while (true) {
    if (visited.has(dir)) break;
    visited.add(dir);

    const candidate = path.join(dir, pathWithExt);
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) {
        return NextResponse.json({ resolvedPath: candidate });
      }
    } catch {
      // 이 레벨에 파일 없음, 계속 탐색
    }

    const parent = path.dirname(dir);
    if (parent === dir) break; // 루트 도달
    dir = parent;
  }

  return NextResponse.json({ resolvedPath: null });
}
