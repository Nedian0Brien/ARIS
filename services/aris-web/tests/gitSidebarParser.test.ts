import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { parseGitStatusEntries } from '@/lib/git/sidebar';

describe('parseGitStatusEntries', () => {
  it('parses mixed staged, unstaged, untracked, renamed, and conflicted entries', () => {
    const output = [
      'M  src/app.ts',
      ' M src/dirty.ts',
      '?? src/new-file.ts',
      'R  src/next-name.ts',
      'src/old-name.ts',
      'UU src/conflict.ts',
      '',
    ].join('\0');

    expect(parseGitStatusEntries(output)).toEqual([
      {
        path: 'src/app.ts',
        originalPath: null,
        indexStatus: 'M',
        workTreeStatus: ' ',
        staged: true,
        unstaged: false,
        untracked: false,
        conflicted: false,
      },
      {
        path: 'src/conflict.ts',
        originalPath: null,
        indexStatus: 'U',
        workTreeStatus: 'U',
        staged: true,
        unstaged: true,
        untracked: false,
        conflicted: true,
      },
      {
        path: 'src/dirty.ts',
        originalPath: null,
        indexStatus: ' ',
        workTreeStatus: 'M',
        staged: false,
        unstaged: true,
        untracked: false,
        conflicted: false,
      },
      {
        path: 'src/new-file.ts',
        originalPath: null,
        indexStatus: '?',
        workTreeStatus: '?',
        staged: false,
        unstaged: true,
        untracked: true,
        conflicted: false,
      },
      {
        path: 'src/next-name.ts',
        originalPath: 'src/old-name.ts',
        indexStatus: 'R',
        workTreeStatus: ' ',
        staged: true,
        unstaged: false,
        untracked: false,
        conflicted: false,
      },
    ]);
  });
});
