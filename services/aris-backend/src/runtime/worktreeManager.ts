import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const WORKTREES_DIR = '.worktrees';

/** git branch 이름으로 사용하기 위해 문자열을 정규화 */
export function sanitizeBranchName(raw: string): string {
  const cleaned = raw
    .trim()
    .replace(/[^a-zA-Z0-9/_.-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (!cleaned) {
    throw new Error(`Invalid branch name: ${JSON.stringify(raw)}`);
  }
  return cleaned;
}

/** branch가 없으면 projectPath, 있으면 worktree 경로를 반환 (존재 여부 확인 없음) */
export async function resolveWorktreePath(
  projectPath: string,
  branch: string | undefined,
): Promise<string> {
  if (!branch) {
    return projectPath;
  }
  const safe = sanitizeBranchName(branch);
  return join(projectPath, WORKTREES_DIR, safe);
}

/** 비동기 없이 경로만 계산 (worktree 존재 여부 확인 없음) */
export function computeWorktreePath(projectPath: string, branch: string | undefined): string {
  if (!branch) {
    return projectPath;
  }
  const safe = sanitizeBranchName(branch);
  return join(projectPath, WORKTREES_DIR, safe);
}

/**
 * branch가 지정된 경우 git worktree를 생성하거나 기존 것을 재사용한다.
 * branch가 없으면 projectPath를 그대로 반환한다.
 */
export async function ensureWorktree(
  projectPath: string,
  branch: string | undefined,
): Promise<string> {
  if (!branch) {
    return projectPath;
  }

  const safeBranch = sanitizeBranchName(branch);
  const worktreePath = join(projectPath, WORKTREES_DIR, safeBranch);

  // 이미 존재하면 그대로 사용
  if (existsSync(worktreePath)) {
    return worktreePath;
  }

  // 브랜치가 로컬에 있는지 확인
  const branchExists = await execFileAsync(
    'git',
    ['show-ref', '--verify', '--quiet', `refs/heads/${safeBranch}`],
    { cwd: projectPath },
  )
    .then(() => true)
    .catch(() => false);

  if (branchExists) {
    await execFileAsync('git', ['worktree', 'add', worktreePath, safeBranch], {
      cwd: projectPath,
    });
  } else {
    // 없으면 현재 HEAD 기준으로 새 브랜치 생성
    await execFileAsync('git', ['worktree', 'add', '-b', safeBranch, worktreePath], {
      cwd: projectPath,
    });
  }

  return worktreePath;
}
