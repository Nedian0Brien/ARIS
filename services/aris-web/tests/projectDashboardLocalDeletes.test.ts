import { describe, expect, it } from 'vitest';

import type { ProjectSummary } from '@/lib/happy/types';
import { reconcileDeletedProjects } from '@/app/projectDashboardState';

function makeProject(id: string): ProjectSummary {
  return {
    id,
    agent: 'codex',
    status: 'idle',
    lastActivityAt: '2026-04-15T00:00:00.000Z',
    riskScore: 0,
    projectName: `/workspace/${id}`,
  };
}

describe('reconcileDeletedProjects', () => {
  it('keeps locally deleted projects hidden when a stale refresh returns them again', () => {
    const deletedIds = new Set(['project-1']);

    const result = reconcileDeletedProjects(
      [makeProject('project-1'), makeProject('project-2')],
      deletedIds,
    );

    expect(result.projects.map((project) => project.id)).toEqual(['project-2']);
    expect([...result.pendingDeletedIds]).toEqual(['project-1']);
  });

  it('clears deletion tombstones once the backend stops returning the deleted project', () => {
    const deletedIds = new Set(['project-1']);

    const result = reconcileDeletedProjects(
      [makeProject('project-2')],
      deletedIds,
    );

    expect(result.projects.map((project) => project.id)).toEqual(['project-2']);
    expect([...result.pendingDeletedIds]).toEqual([]);
  });
});
