import { describe, expect, it } from 'vitest';
import { selectRecentProjects } from '@/app/homeProjects';
import type { SessionSummary } from '@/lib/happy/types';

function session(id: string, lastActivityAt: string | null, overrides: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    agent: 'codex',
    status: 'idle',
    lastActivityAt,
    riskScore: 0,
    projectName: id,
    totalChats: 0,
    ...overrides,
  };
}

describe('home recent projects', () => {
  it('selects at most six projects by latest activity', () => {
    const sessions = [
      session('old-pinned-running', '2026-04-20T09:00:00.000Z', { isPinned: true, status: 'running' }),
      session('latest-2', '2026-04-25T09:00:00.000Z'),
      session('latest-6', '2026-04-25T05:00:00.000Z'),
      session('latest-1', '2026-04-25T10:00:00.000Z'),
      session('latest-4', '2026-04-25T07:00:00.000Z'),
      session('latest-3', '2026-04-25T08:00:00.000Z'),
      session('latest-5', '2026-04-25T06:00:00.000Z'),
      session('no-activity', null),
    ];

    expect(selectRecentProjects(sessions).map((item) => item.id)).toEqual([
      'latest-1',
      'latest-2',
      'latest-3',
      'latest-4',
      'latest-5',
      'latest-6',
    ]);
  });
});
