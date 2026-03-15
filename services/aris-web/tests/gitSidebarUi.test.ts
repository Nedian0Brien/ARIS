import { describe, expect, it } from 'vitest';
import { buildGitFileTree, detectGitDiffLanguage, parseGitUnifiedDiff } from '@/lib/git/sidebarUi';

describe('git sidebar ui helpers', () => {
  it('builds folder-first git trees from flat file paths', () => {
    const tree = buildGitFileTree([
      { path: 'app/page.tsx' },
      { path: 'app/api/git/route.ts' },
      { path: 'lib/git/sidebar.ts' },
    ]);

    expect(tree).toHaveLength(2);
    expect(tree[0]).toMatchObject({
      kind: 'folder',
      name: 'app',
      fileCount: 2,
    });
    expect(tree[1]).toMatchObject({
      kind: 'folder',
      name: 'lib',
      fileCount: 1,
    });

    if (tree[0]?.kind !== 'folder') {
      throw new Error('expected folder');
    }

    expect(tree[0].children[0]).toMatchObject({
      kind: 'folder',
      name: 'api',
      fileCount: 1,
    });
    expect(tree[0].children[1]).toMatchObject({
      kind: 'file',
      name: 'page.tsx',
      path: 'app/page.tsx',
    });
  });

  it('parses unified diff hunks with line numbers and highlighted code', () => {
    const diff = [
      'diff --git a/src/example.ts b/src/example.ts',
      'index 1111111..2222222 100644',
      '--- a/src/example.ts',
      '+++ b/src/example.ts',
      '@@ -1,3 +1,4 @@',
      ' const keep = true;',
      '-const removed = false;',
      '+const added = true;',
      '+const value = keep ? 1 : 0;',
      ' console.log(keep);',
    ].join('\n');

    const parsed = parseGitUnifiedDiff(diff, 'src/example.ts');

    expect(parsed.language).toBe('typescript');
    expect(parsed.sections[0]).toMatchObject({
      type: 'meta',
      lines: [
        'diff --git a/src/example.ts b/src/example.ts',
        'index 1111111..2222222 100644',
        '--- a/src/example.ts',
        '+++ b/src/example.ts',
      ],
    });

    const hunk = parsed.sections[1];
    expect(hunk).toMatchObject({
      type: 'hunk',
      oldRange: '1',
      newRange: '1',
    });

    if (!hunk || hunk.type !== 'hunk') {
      throw new Error('expected hunk');
    }

    expect(hunk.lines[0]).toMatchObject({
      type: 'context',
      oldLineNumber: 1,
      newLineNumber: 1,
    });
    expect(hunk.lines[1]).toMatchObject({
      type: 'del',
      oldLineNumber: 2,
      newLineNumber: null,
    });
    expect(hunk.lines[2]).toMatchObject({
      type: 'add',
      oldLineNumber: null,
      newLineNumber: 2,
    });
    expect(hunk.lines[2]?.highlightedHtml).toContain('token keyword');
  });

  it('falls back to text when file extension is unknown', () => {
    expect(detectGitDiffLanguage('docs/CHANGELOG')).toBe('text');
  });
});
