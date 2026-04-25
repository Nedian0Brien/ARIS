import type { SessionSummary } from '@/lib/happy/types';

export const RECENT_PROJECT_LIMIT = 6;

function activityTime(session: SessionSummary): number {
  const parsed = Date.parse(session.lastActivityAt ?? '');
  return Number.isNaN(parsed) ? -1 : parsed;
}

export function selectRecentProjects(
  sessions: SessionSummary[],
  limit = RECENT_PROJECT_LIMIT,
): SessionSummary[] {
  const count = Math.max(0, Math.floor(limit));

  return [...sessions]
    .sort((a, b) => {
      const timeDelta = activityTime(b) - activityTime(a);
      if (timeDelta !== 0) return timeDelta;
      return a.id.localeCompare(b.id);
    })
    .slice(0, count);
}
