import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const mocks = vi.hoisted(() => ({
  stat: vi.fn(),
  readdir: vi.fn(),
  requireApiUser: vi.fn(),
}));

vi.mock('node:fs/promises', () => ({
  default: {
    stat: mocks.stat,
    readdir: mocks.readdir,
  },
}));

vi.mock('@/lib/auth/guard', () => ({
  requireApiUser: mocks.requireApiUser,
}));

vi.mock('@/lib/config', () => ({
  env: {
    NODE_ENV: 'production',
    HOST_HOME_DIR: '/home/ubuntu',
    HOST_PROJECTS_ROOT: '/home/ubuntu/project',
  },
}));

describe('fs list route', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.requireApiUser.mockResolvedValue({ user: { role: 'operator' } });
    mocks.stat.mockResolvedValue({ isDirectory: () => true });
    mocks.readdir.mockResolvedValue([
      {
        name: 'project',
        isDirectory: () => true,
        isFile: () => false,
      },
    ]);
  });

  it('resolves host absolute paths without remapping them under /workspace', async () => {
    const { GET } = await import('@/app/api/fs/list/route');

    const response = await GET(
      new NextRequest('http://localhost/api/fs/list?path=%2Fhome%2Fubuntu'),
    );

    const payload = await response.json() as {
      currentPath: string;
      parentPath: string | null;
      directories: Array<{ name: string; path: string }>;
    };

    expect(mocks.stat).toHaveBeenCalledWith('/home/ubuntu');
    expect(payload.currentPath).toBe('/home/ubuntu');
    expect(payload.parentPath).toBeNull();
    expect(payload.directories).toEqual([
      expect.objectContaining({
        name: 'project',
        path: '/home/ubuntu/project',
      }),
    ]);
  });
});
