import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  execFile: vi.fn(),
  resolveWorkspacePath: vi.fn(),
}));

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
});
