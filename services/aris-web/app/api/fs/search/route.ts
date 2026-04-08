import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireApiUser } from '@/lib/auth/guard';
import { resolveFsPath } from '@/lib/fs/pathResolver';
const MAX_RESULTS = 100;
const MAX_DEPTH = 8;
const IGNORE_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', '__pycache__',
  '.cache', 'coverage', '.turbo', '.vercel',
]);

interface FileResult {
  name: string;
  path: string;
  isDirectory: boolean;
}

async function searchFiles(
  visibleRootPath: string,
  runtimeRootPath: string,
  dirPath: string,
  query: string,
  results: FileResult[],
  depth: number,
): Promise<void> {
  if (depth > MAX_DEPTH || results.length >= MAX_RESULTS) return;

  let entries;
  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch {
    return;
  }

  for (const entry of entries) {
    if (results.length >= MAX_RESULTS) break;
    if (entry.name.startsWith('.')) continue;
    if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue;

    const relativePath = path.relative(runtimeRootPath, dirPath);
    const normalizedRelative = path.join(visibleRootPath, relativePath, entry.name);

    if (entry.name.toLowerCase().includes(query)) {
      results.push({
        name: entry.name,
        path: normalizedRelative,
        isDirectory: entry.isDirectory(),
      });
    }

    if (entry.isDirectory()) {
      await searchFiles(visibleRootPath, runtimeRootPath, path.join(dirPath, entry.name), query, results, depth + 1);
    }
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const query = (searchParams.get('q') ?? '').trim().toLowerCase();
  const requestedRootPath = searchParams.get('path') ?? '/';

  if (!query) {
    return NextResponse.json({ results: [] });
  }

  const { visiblePath, runtimePath } = resolveFsPath(requestedRootPath);
  try {
    const stat = await fs.stat(runtimePath);
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'Directory not found' }, { status: 404 });
    }
  } catch {
    return NextResponse.json({ error: 'Workspace not found' }, { status: 404 });
  }

  const results: FileResult[] = [];
  await searchFiles(visiblePath, runtimePath, runtimePath, query, results, 0);

  results.sort((a, b) => {
    // 정확히 일치하는 이름 우선
    const aExact = a.name.toLowerCase() === query;
    const bExact = b.name.toLowerCase() === query;
    if (aExact && !bExact) return -1;
    if (!aExact && bExact) return 1;
    // 파일 우선 (디렉토리 후순위)
    if (!a.isDirectory && b.isDirectory) return -1;
    if (a.isDirectory && !b.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  return NextResponse.json({ results });
}
