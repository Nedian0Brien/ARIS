import { describe, expect, it } from 'vitest';
import {
  matchWorkspaceFileBadge,
  relativeWorkspacePath,
  type ProjectPanelGitFile,
} from '@/components/project-chat/projectChatSurfaceUtils';

function gitFile(path: string, overrides: Partial<ProjectPanelGitFile> = {}): ProjectPanelGitFile {
  return {
    path,
    indexStatus: ' ',
    workTreeStatus: 'M',
    staged: false,
    unstaged: true,
    untracked: false,
    conflicted: false,
    ...overrides,
  };
}

describe('matchWorkspaceFileBadge', () => {
  const files = [
    gitFile('src/app.ts'),
    gitFile('src/new.ts', { untracked: true, unstaged: false, workTreeStatus: '?' }),
    gitFile('src/staged.ts', { staged: true, unstaged: false, indexStatus: 'A', workTreeStatus: ' ' }),
    gitFile('docs/conflict.md', { conflicted: true }),
  ];

  it('labels files by their git state', () => {
    expect(matchWorkspaceFileBadge(files, '/workspace/src/app.ts', false)).toEqual({ label: 'M', tone: 'modified' });
    expect(matchWorkspaceFileBadge(files, '/workspace/src/new.ts', false)).toEqual({ label: 'U', tone: 'new' });
    expect(matchWorkspaceFileBadge(files, '/workspace/src/staged.ts', false)).toEqual({ label: 'A', tone: 'staged' });
    expect(matchWorkspaceFileBadge(files, '/workspace/docs/conflict.md', false)).toEqual({ label: 'C', tone: 'conflict' });
    expect(matchWorkspaceFileBadge(files, '/workspace/src/clean.ts', false)).toBeNull();
  });

  it('counts changed files under a directory', () => {
    expect(matchWorkspaceFileBadge(files, '/workspace/src', true)).toEqual({ label: '3', tone: 'modified' });
    expect(matchWorkspaceFileBadge(files, '/workspace/docs', true)).toEqual({ label: '1', tone: 'modified' });
    expect(matchWorkspaceFileBadge(files, '/workspace/lib', true)).toBeNull();
  });

  it('falls back to suffix matching when the workspace root is a repo subfolder', () => {
    // git 경로는 저장소 루트 기준(services/aris-web/...), 워크스페이스는 그 하위.
    const nested = [gitFile('services/aris-web/src/app.ts')];
    expect(matchWorkspaceFileBadge(nested, '/workspace/src/app.ts', false)).toEqual({ label: 'M', tone: 'modified' });
    expect(matchWorkspaceFileBadge(nested, '/workspace/src', true)).toEqual({ label: '1', tone: 'modified' });
  });

  it('normalizes the /workspace virtual prefix', () => {
    expect(relativeWorkspacePath('/workspace/a/b.ts')).toBe('a/b.ts');
    expect(relativeWorkspacePath('/workspace')).toBe('');
  });
});
