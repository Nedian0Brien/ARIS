import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  stat: vi.fn(),
  readdir: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    access: mocks.access,
    stat: mocks.stat,
    readdir: mocks.readdir,
  },
}));

vi.mock('@/lib/config', () => ({
  env: {
    HOST_PROJECTS_ROOT: '/home/ubuntu/project',
    HOST_HOME_DIR: '/home/ubuntu',
    ARIS_AGENT_SKILLS_ROOT: '/home/ubuntu/.agents/skills',
    ARIS_CODEX_SKILLS_ROOT: '/home/ubuntu/.codex/skills',
    ARIS_CLAUDE_HOME: '/home/ubuntu/.claude',
    NODE_ENV: 'production',
  },
}));

describe('workspace path resolution', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  it('maps legacy /workspace paths back to host absolute paths', async () => {
    mocks.access.mockImplementation(async (targetPath: string) => {
      if (targetPath === '/home/ubuntu/project/ARIS') {
        return;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const { resolveWorkspacePath } = await import('@/lib/customization/catalog');

    await expect(resolveWorkspacePath('/workspace/ARIS')).resolves.toEqual({
      displayPath: '/home/ubuntu/project/ARIS',
      runtimePath: '/home/ubuntu/project/ARIS',
    });
  });

  it('keeps host absolute paths visible to the client in production', async () => {
    mocks.access.mockImplementation(async (targetPath: string) => {
      if (targetPath === '/home/ubuntu/project/ARIS') {
        return;
      }
      throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
    });

    const { resolveWorkspaceClientPath } = await import('@/lib/customization/catalog');

    await expect(resolveWorkspaceClientPath('/home/ubuntu/project/ARIS')).resolves.toBe(
      '/home/ubuntu/project/ARIS',
    );
  });
});
