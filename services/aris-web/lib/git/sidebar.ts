import 'server-only';

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { resolveWorkspacePath } from '@/lib/customization/catalog';

const execFileAsync = promisify(execFile);
const GIT_TIMEOUT_MS = 15_000;
const GIT_MAX_BUFFER_BYTES = 4 * 1024 * 1024;

export type GitDiffScope = 'working' | 'staged';
export type GitActionName = 'stage' | 'unstage' | 'commit' | 'fetch' | 'pull' | 'push';

export type GitFileEntry = {
  path: string;
  originalPath: string | null;
  indexStatus: string;
  workTreeStatus: string;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
  conflicted: boolean;
};

export type GitSidebarOverview = {
  workspacePath: string;
  branch: string | null;
  upstreamBranch: string | null;
  ahead: number;
  behind: number;
  isClean: boolean;
  stagedCount: number;
  unstagedCount: number;
  untrackedCount: number;
  conflictedCount: number;
  files: GitFileEntry[];
};

export type GitSidebarActionResult = {
  overview: GitSidebarOverview;
  output: string;
};

type RunGitResult = {
  stdout: string;
  stderr: string;
};

type GitCommandErrorOptions = {
  stdout?: string;
  stderr?: string;
  cause?: unknown;
};

class GitCommandError extends Error {
  readonly stdout: string;
  readonly stderr: string;

  constructor(message: string, options: GitCommandErrorOptions = {}) {
    super(message);
    this.name = 'GitCommandError';
    this.stdout = options.stdout?.trim() ?? '';
    this.stderr = options.stderr?.trim() ?? '';
    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

function sanitizeGitPathspec(pathspec: string): string {
  const normalized = pathspec.replace(/\\/g, '/').trim().replace(/^\/+/, '');
  if (!normalized || normalized === '.' || normalized === '/') {
    throw new Error('유효한 파일 경로가 필요합니다.');
  }
  if (normalized.split('/').some((segment) => segment === '..')) {
    throw new Error(`허용되지 않는 Git 경로입니다: ${pathspec}`);
  }
  return normalized;
}

function parseAheadBehind(output: string): { ahead: number; behind: number } {
  const [behindRaw, aheadRaw] = output.trim().split(/\s+/);
  const behind = Number.parseInt(behindRaw ?? '0', 10);
  const ahead = Number.parseInt(aheadRaw ?? '0', 10);
  return {
    ahead: Number.isFinite(ahead) ? ahead : 0,
    behind: Number.isFinite(behind) ? behind : 0,
  };
}

export function parseGitStatusEntries(output: string): GitFileEntry[] {
  const records = output.split('\0').filter(Boolean);
  const files: GitFileEntry[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    if (record.length < 3) {
      continue;
    }

    const indexStatus = record[0] ?? ' ';
    const workTreeStatus = record[1] ?? ' ';
    let currentPath = record.slice(3);
    let originalPath: string | null = null;

    const isRenameOrCopy = indexStatus === 'R'
      || indexStatus === 'C'
      || workTreeStatus === 'R'
      || workTreeStatus === 'C';
    if (isRenameOrCopy) {
      originalPath = records[index + 1] ?? null;
      index += 1;
    }

    const untracked = indexStatus === '?' && workTreeStatus === '?';
    const staged = indexStatus !== ' ' && indexStatus !== '?';
    const unstaged = untracked || (workTreeStatus !== ' ' && workTreeStatus !== '?');
    const conflicted = indexStatus === 'U'
      || workTreeStatus === 'U'
      || (indexStatus === 'A' && workTreeStatus === 'A')
      || (indexStatus === 'D' && workTreeStatus === 'D');

    if (!currentPath && originalPath) {
      currentPath = originalPath;
      originalPath = null;
    }

    files.push({
      path: currentPath,
      originalPath,
      indexStatus,
      workTreeStatus,
      staged,
      unstaged,
      untracked,
      conflicted,
    });
  }

  return files.sort((left, right) => left.path.localeCompare(right.path));
}

async function runGitCommand(cwd: string, args: string[]): Promise<RunGitResult> {
  try {
    const result = await execFileAsync('git', args, {
      cwd,
      encoding: 'utf8',
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: GIT_MAX_BUFFER_BYTES,
    });

    return {
      stdout: result.stdout ?? '',
      stderr: result.stderr ?? '',
    };
  } catch (error) {
    const failure = error as NodeJS.ErrnoException & { stdout?: string; stderr?: string };
    const stderr = failure.stderr?.trim() ?? '';
    if (failure.code === 'ENOENT') {
      throw new GitCommandError('Git CLI를 찾을 수 없습니다. 런타임 이미지에 git이 설치되어 있는지 확인해 주세요.', {
        stdout: failure.stdout,
        stderr: failure.stderr,
        cause: error,
      });
    }
    if (/not a git repository/i.test(stderr)) {
      throw new GitCommandError('Git 저장소를 찾을 수 없습니다.', {
        stdout: failure.stdout,
        stderr: failure.stderr,
        cause: error,
      });
    }

    const details = [stderr, failure.stdout?.trim() ?? ''].filter(Boolean).join('\n');
    throw new GitCommandError(details || 'Git 명령 실행에 실패했습니다.', {
      stdout: failure.stdout,
      stderr: failure.stderr,
      cause: error,
    });
  }
}

async function resolveGitWorkspace(projectPath: string) {
  const resolved = await resolveWorkspacePath(projectPath);
  await runGitCommand(resolved.runtimePath, ['rev-parse', '--show-toplevel']);
  return resolved;
}

function formatGitOutput(stdout: string, stderr: string, fallback: string): string {
  const combined = [stdout.trim(), stderr.trim()].filter(Boolean).join('\n');
  return combined || fallback;
}

export async function getGitSidebarOverview(projectPath: string): Promise<GitSidebarOverview> {
  const resolved = await resolveGitWorkspace(projectPath);

  const [statusResult, branchResult, upstreamResult, aheadBehindResult] = await Promise.all([
    runGitCommand(resolved.runtimePath, ['status', '--porcelain=v1', '-z', '--untracked-files=all']),
    runGitCommand(resolved.runtimePath, ['branch', '--show-current']),
    runGitCommand(resolved.runtimePath, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}']).catch(() => ({
      stdout: '',
      stderr: '',
    })),
    runGitCommand(resolved.runtimePath, ['rev-list', '--left-right', '--count', '@{upstream}...HEAD']).catch(() => ({
      stdout: '0 0',
      stderr: '',
    })),
  ]);

  const files = parseGitStatusEntries(statusResult.stdout);
  const stagedCount = files.filter((file) => file.staged).length;
  const unstagedCount = files.filter((file) => file.unstaged || file.untracked).length;
  const untrackedCount = files.filter((file) => file.untracked).length;
  const conflictedCount = files.filter((file) => file.conflicted).length;
  const { ahead, behind } = parseAheadBehind(aheadBehindResult.stdout);

  return {
    workspacePath: resolved.displayPath,
    branch: branchResult.stdout.trim() || null,
    upstreamBranch: upstreamResult.stdout.trim() || null,
    ahead,
    behind,
    isClean: files.length === 0,
    stagedCount,
    unstagedCount,
    untrackedCount,
    conflictedCount,
    files,
  };
}

export async function getGitSidebarDiff(projectPath: string, filePath: string, scope: GitDiffScope): Promise<string> {
  const resolved = await resolveGitWorkspace(projectPath);
  const safePath = sanitizeGitPathspec(filePath);
  const args = scope === 'staged'
    ? ['diff', '--no-ext-diff', '--cached', '--', safePath]
    : ['diff', '--no-ext-diff', '--', safePath];
  const result = await runGitCommand(resolved.runtimePath, args);
  return result.stdout;
}

export async function performGitSidebarAction(
  projectPath: string,
  input: {
    action: GitActionName;
    paths?: string[];
    message?: string;
  },
): Promise<GitSidebarActionResult> {
  const resolved = await resolveGitWorkspace(projectPath);
  let result: RunGitResult;

  if (input.action === 'stage') {
    const paths = (input.paths ?? []).map(sanitizeGitPathspec);
    result = await runGitCommand(
      resolved.runtimePath,
      paths.length > 0 ? ['add', '--', ...paths] : ['add', '-A', '--', '.'],
    );
  } else if (input.action === 'unstage') {
    const paths = (input.paths ?? []).map(sanitizeGitPathspec);
    result = await runGitCommand(
      resolved.runtimePath,
      paths.length > 0 ? ['reset', 'HEAD', '--', ...paths] : ['reset', 'HEAD', '--', '.'],
    );
  } else if (input.action === 'commit') {
    const message = input.message?.trim() ?? '';
    if (!message) {
      throw new Error('커밋 메시지를 입력해 주세요.');
    }
    result = await runGitCommand(resolved.runtimePath, ['commit', '-m', message]);
  } else if (input.action === 'fetch') {
    result = await runGitCommand(resolved.runtimePath, ['fetch', '--all', '--prune']);
  } else if (input.action === 'pull') {
    result = await runGitCommand(resolved.runtimePath, ['pull', '--rebase', '--autostash']);
  } else {
    result = await runGitCommand(resolved.runtimePath, ['push']);
  }

  const overview = await getGitSidebarOverview(projectPath);
  const fallback = input.action === 'commit'
    ? '커밋을 완료했습니다.'
    : input.action === 'stage'
      ? '파일을 스테이징했습니다.'
      : input.action === 'unstage'
        ? '파일을 스테이지에서 내렸습니다.'
        : `${input.action} 작업을 완료했습니다.`;

  return {
    overview,
    output: formatGitOutput(result.stdout, result.stderr, fallback),
  };
}
