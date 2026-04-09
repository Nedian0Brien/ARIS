import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  resolveWorkspacePath: vi.fn(),
}));

mocks.execFile[Symbol.for('nodejs.util.promisify.custom')] = (
  command: string,
  args: string[],
  options: object,
) => new Promise((resolve, reject) => {
  mocks.execFile(command, args, options, (error: unknown, stdout: string, stderr: string) => {
    if (error) {
      const failure = error as { stdout?: string; stderr?: string };
      reject(Object.assign(error as object, {
        stdout: stdout || failure.stdout || '',
        stderr: stderr || failure.stderr || '',
      }));
      return;
    }

    resolve({ stdout, stderr });
  });
});

vi.mock('node:child_process', () => ({
  execFile: mocks.execFile,
}));

vi.mock('@/lib/customization/catalog', () => ({
  resolveWorkspacePath: mocks.resolveWorkspacePath,
}));

describe('git sidebar runtime errors', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    mocks.resolveWorkspacePath.mockResolvedValue({
      displayPath: '/home/ubuntu/project/ARIS',
      runtimePath: '/workspace/ARIS',
    });
  });

  it('surfaces a clear message when git is missing from the runtime image', async () => {
    mocks.execFile.mockImplementation((_command, _args, _options, callback) => {
      const error = Object.assign(new Error('spawn git ENOENT'), { code: 'ENOENT' });
      callback(error, '', '');
    });

    const { getGitSidebarOverview } = await import('@/lib/git/sidebar');

    await expect(getGitSidebarOverview('/home/ubuntu/project/ARIS')).rejects.toThrow(
      'Git CLI를 찾을 수 없습니다. 런타임 이미지에 git이 설치되어 있는지 확인해 주세요.',
    );
  });

  it('retries git commands after registering dubious workspaces as safe directories', async () => {
    const callLog: Array<{ command: string; args: string[] }> = [];
    mocks.execFile.mockImplementation((command, args, options, callback) => {
      callLog.push({ command, args: [...args] });

      const joinedArgs = args.join(' ');
      if (joinedArgs === 'rev-parse --show-toplevel') {
        if (callLog.length === 1) {
          const error = Object.assign(new Error('fatal: detected dubious ownership in repository at \'/workspace/ARIS\''), {
            code: 128,
            stderr: 'fatal: detected dubious ownership in repository at \'/workspace/ARIS\'',
            stdout: '',
          });
          callback(error, '', '');
          return;
        }

        callback(null, '/workspace/ARIS\n', '');
        return;
      }

      if (joinedArgs === 'config --global --add safe.directory /workspace/ARIS') {
        callback(null, '', '');
        return;
      }

      if (joinedArgs === 'status --porcelain=v1 -z --untracked-files=all') {
        callback(null, '', '');
        return;
      }

      if (joinedArgs === 'branch --show-current') {
        callback(null, 'main\n', '');
        return;
      }

      if (joinedArgs === 'rev-parse --abbrev-ref --symbolic-full-name @{upstream}') {
        callback(null, 'origin/main\n', '');
        return;
      }

      if (joinedArgs === 'rev-list --left-right --count @{upstream}...HEAD') {
        callback(null, '0 0\n', '');
        return;
      }

      callback(new Error(`Unexpected git invocation: ${joinedArgs}`), '', '');
    });

    const { getGitSidebarOverview } = await import('@/lib/git/sidebar');

    await expect(getGitSidebarOverview('/home/ubuntu/project/ARIS')).resolves.toEqual(
      expect.objectContaining({
        workspacePath: '/home/ubuntu/project/ARIS',
        branch: 'main',
        upstreamBranch: 'origin/main',
        ahead: 0,
        behind: 0,
        isClean: true,
      }),
    );

    expect(callLog.map(({ args }) => args.join(' '))).toEqual([
      'rev-parse --show-toplevel',
      'config --global --add safe.directory /workspace/ARIS',
      'rev-parse --show-toplevel',
      'status --porcelain=v1 -z --untracked-files=all',
      'branch --show-current',
      'rev-parse --abbrev-ref --symbolic-full-name @{upstream}',
      'rev-list --left-right --count @{upstream}...HEAD',
    ]);
  });
});
