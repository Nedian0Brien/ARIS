import { describe, expect, it } from 'vitest';

import type { SessionSummary } from '@/lib/happy/types';
import { reconcileDeletedSessions } from '@/app/sessionDashboardState';

function makeSession(id: string): SessionSummary {
  return {
    id,
    agent: 'codex',
    status: 'idle',
    lastActivityAt: '2026-04-15T00:00:00.000Z',
    riskScore: 0,
    projectName: `/workspace/${id}`,
  };
}

describe('reconcileDeletedSessions', () => {
  it('keeps locally deleted sessions hidden when a stale refresh returns them again', () => {
    const deletedIds = new Set(['session-1']);

    const result = reconcileDeletedSessions(
      [makeSession('session-1'), makeSession('session-2')],
      deletedIds,
    );

    expect(result.sessions.map((session) => session.id)).toEqual(['session-2']);
    expect([...result.pendingDeletedIds]).toEqual(['session-1']);
  });

  it('clears deletion tombstones once the backend stops returning the deleted session', () => {
    const deletedIds = new Set(['session-1']);

    const result = reconcileDeletedSessions(
      [makeSession('session-2')],
      deletedIds,
    );

    expect(result.sessions.map((session) => session.id)).toEqual(['session-2']);
    expect([...result.pendingDeletedIds]).toEqual([]);
  });
});
