import type { SessionSummary } from '@/lib/happy/types';

export function reconcileDeletedSessions(
  sessions: SessionSummary[],
  pendingDeletedIds: Set<string>,
): {
  sessions: SessionSummary[];
  pendingDeletedIds: Set<string>;
} {
  if (pendingDeletedIds.size === 0) {
    return {
      sessions,
      pendingDeletedIds,
    };
  }

  const incomingIds = new Set(sessions.map((session) => session.id));
  const nextPendingDeletedIds = new Set(
    [...pendingDeletedIds].filter((sessionId) => incomingIds.has(sessionId)),
  );
  const isPendingSetUnchanged =
    nextPendingDeletedIds.size === pendingDeletedIds.size
    && [...nextPendingDeletedIds].every((sessionId) => pendingDeletedIds.has(sessionId));

  return {
    sessions: sessions.filter((session) => !pendingDeletedIds.has(session.id)),
    pendingDeletedIds: isPendingSetUnchanged ? pendingDeletedIds : nextPendingDeletedIds,
  };
}
