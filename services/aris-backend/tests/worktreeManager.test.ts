import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { resolveWorktreePath, ensureWorktree, sanitizeBranchName, computeWorktreePath } from '../src/runtime/worktreeManager.js';

function initGitRepo(projectPath: string) {
  execFileSync('git', ['init'], { cwd: projectPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.email', 'test@example.com'], { cwd: projectPath, stdio: 'ignore' });
  execFileSync('git', ['config', 'user.name', 'Test User'], { cwd: projectPath, stdio: 'ignore' });
  writeFileSync(join(projectPath, 'README.md'), 'fixture\n');
  execFileSync('git', ['add', 'README.md'], { cwd: projectPath, stdio: 'ignore' });
  execFileSync('git', ['commit', '-m', 'init'], { cwd: projectPath, stdio: 'ignore' });
}

describe('sanitizeBranchName', () => {
  it('replaces spaces and special chars with hyphens', () => {
    expect(sanitizeBranchName('feat/my feature')).toBe('feat/my-feature');
  });

  it('replaces slashes kept but spaces removed', () => {
    expect(sanitizeBranchName('feat my feature')).toBe('feat-my-feature');
  });

  it('strips leading and trailing hyphens', () => {
    expect(sanitizeBranchName('--feat--')).toBe('feat');
  });

  it('throws on empty result', () => {
    expect(() => sanitizeBranchName('   ')).toThrow();
  });

  it('preserves valid branch name characters', () => {
    expect(sanitizeBranchName('feat/my-feature_v1.0')).toBe('feat/my-feature_v1.0');
  });
});

describe('resolveWorktreePath', () => {
  it('returns projectPath when branch is undefined', async () => {
    const result = await resolveWorktreePath('/projects/my-app', undefined);
    expect(result).toBe('/projects/my-app');
  });

  it('returns worktree path under .worktrees when branch is provided', async () => {
    const result = await resolveWorktreePath('/projects/my-app', 'feat/my-feature');
    expect(result).toBe('/projects/my-app/.worktrees/feat/my-feature');
  });
});

describe('computeWorktreePath', () => {
  it('returns projectPath when branch is undefined', () => {
    expect(computeWorktreePath('/projects/my-app', undefined)).toBe('/projects/my-app');
  });

  it('returns worktree path for a branch', () => {
    expect(computeWorktreePath('/projects/my-app', 'feat/my-feature')).toBe(
      '/projects/my-app/.worktrees/feat/my-feature',
    );
  });
});

describe('ensureWorktree', () => {
  it('returns projectPath immediately when branch is not provided', async () => {
    const result = await ensureWorktree('/projects/my-app', undefined);
    expect(result).toBe('/projects/my-app');
  });

  it('reuses an existing worktree path without invoking git', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'aris-worktree-existing-'));
    mkdirSync(join(projectPath, '.worktrees', 'feat', 'panel-one'), { recursive: true });

    const result = await ensureWorktree(projectPath, 'feat/panel one');

    expect(result).toBe(join(projectPath, '.worktrees', 'feat', 'panel-one'));
  });

  it('adds a worktree for an existing local branch', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'aris-worktree-existing-branch-'));
    initGitRepo(projectPath);
    execFileSync('git', ['branch', 'feat/panel-one'], { cwd: projectPath, stdio: 'ignore' });

    await expect(ensureWorktree(projectPath, 'feat/panel-one')).resolves.toBe(
      join(projectPath, '.worktrees', 'feat', 'panel-one'),
    );
    expect(existsSync(join(projectPath, '.worktrees', 'feat', 'panel-one', '.git'))).toBe(true);
  });

  it('creates a new branch-backed worktree when the branch is missing', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'aris-worktree-new-branch-'));
    initGitRepo(projectPath);

    await expect(ensureWorktree(projectPath, 'parallel/panel-two')).resolves.toBe(
      join(projectPath, '.worktrees', 'parallel', 'panel-two'),
    );
    expect(existsSync(join(projectPath, '.worktrees', 'parallel', 'panel-two', '.git'))).toBe(true);
  });

  it('surfaces git worktree creation failures with a stable prefix', async () => {
    const projectPath = mkdtempSync(join(tmpdir(), 'aris-worktree-failure-'));

    await expect(ensureWorktree(projectPath, 'parallel/fails')).rejects.toThrow(
      'WORKTREE_CREATE_FAILED: fatal: not a git repository',
    );
  });
});
