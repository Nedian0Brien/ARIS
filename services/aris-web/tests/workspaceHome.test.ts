import { describe, expect, it } from 'vitest';
import {
  deriveWorkspaceTitle,
  limitWorkspaceHomeChats,
} from '@/app/sessions/[sessionId]/workspaceHome';

describe('workspace home behavior', () => {
  it('derives the workspace title from the last directory in the path', () => {
    expect(deriveWorkspaceTitle('/home/ubuntu/project/ARIS')).toBe('ARIS');
    expect(deriveWorkspaceTitle('/tmp/example-workspace/')).toBe('example-workspace');
  });

  it('shows at most five chats on the workspace home list', () => {
    expect(limitWorkspaceHomeChats([1, 2, 3])).toEqual([1, 2, 3]);
    expect(limitWorkspaceHomeChats([1, 2, 3, 4, 5, 6, 7])).toEqual([1, 2, 3, 4, 5]);
  });
});
