import { describe, expect, it } from 'vitest';

import { getWorkspaceAbsolutePathForCopy, getWorkspaceRelativePathForCopy } from '@/lib/workspacePathCopy';

describe('workspace path copy helpers', () => {
  it('returns dot when the target matches the workspace root', () => {
    expect(getWorkspaceRelativePathForCopy('/home/ubuntu/project/ARIS', '/home/ubuntu/project/ARIS')).toBe('.');
  });

  it('returns a workspace-root relative path for nested files', () => {
    expect(
      getWorkspaceRelativePathForCopy(
        '/home/ubuntu/project/ARIS/services/aris-web/app/page.tsx',
        '/home/ubuntu/project/ARIS',
      ),
    ).toBe('services/aris-web/app/page.tsx');
  });

  it('normalizes repeated and trailing slashes before computing the relative path', () => {
    expect(
      getWorkspaceRelativePathForCopy(
        '/home/ubuntu/project/ARIS//services/aris-web/',
        '/home/ubuntu/project/ARIS/',
      ),
    ).toBe('services/aris-web');
  });

  it('falls back to the absolute path when the target is outside the workspace root', () => {
    expect(
      getWorkspaceRelativePathForCopy(
        '/home/ubuntu/project/OTHER/services/aris-web/app/page.tsx',
        '/home/ubuntu/project/ARIS',
      ),
    ).toBe('/home/ubuntu/project/OTHER/services/aris-web/app/page.tsx');
  });

  it('normalizes absolute paths before copying them', () => {
    expect(getWorkspaceAbsolutePathForCopy('/home/ubuntu/project/ARIS//services/aris-web/')).toBe(
      '/home/ubuntu/project/ARIS/services/aris-web',
    );
  });
});
