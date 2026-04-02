import { describe, expect, it, vi, beforeEach } from 'vitest';

vi.mock('node:child_process');

import { resolveWorktreePath, ensureWorktree, sanitizeBranchName, computeWorktreePath } from '../src/runtime/worktreeManager.js';
import * as childProcess from 'node:child_process';

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
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('returns projectPath immediately when branch is not provided', async () => {
    const result = await ensureWorktree('/projects/my-app', undefined);
    expect(result).toBe('/projects/my-app');
    expect(childProcess.execFile).not.toHaveBeenCalled();
  });
});
