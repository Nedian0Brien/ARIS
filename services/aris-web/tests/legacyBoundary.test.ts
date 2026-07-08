import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

const sourceRoots = ['app', 'components', 'lib'];
const ignoredSegments = new Set(['node_modules', '_legacy', '__tests__']);
const sourceExtensions = new Set(['.ts', '.tsx']);

function listSourceFiles(root: string): string[] {
  const result: string[] = [];

  function visit(current: string) {
    const stats = statSync(current);
    if (stats.isDirectory()) {
      const name = current.split('/').pop() ?? '';
      if (ignoredSegments.has(name)) {
        return;
      }
      for (const entry of readdirSync(current)) {
        visit(join(current, entry));
      }
      return;
    }

    const extension = current.endsWith('.tsx') ? '.tsx' : current.endsWith('.ts') ? '.ts' : '';
    if (sourceExtensions.has(extension)) {
      result.push(current);
    }
  }

  visit(root);
  return result;
}

describe('legacy boundary', () => {
  it('keeps active web source from importing app/_legacy modules', () => {
    const webRoot = join(__dirname, '..');
    const offenders = sourceRoots.flatMap((root) => listSourceFiles(join(webRoot, root)))
      .filter((filePath) => {
        const source = readFileSync(filePath, 'utf8');
        return source.includes('app/_legacy')
          || source.includes('./_legacy')
          || source.includes('../app/_legacy')
          || source.includes('@/app/_legacy');
      })
      .map((filePath) => relative(webRoot, filePath))
      .sort();

    expect(offenders).toEqual([]);
  });
});
