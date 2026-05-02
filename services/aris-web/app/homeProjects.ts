import type { SessionChat, SessionSummary } from '@/lib/happy/types';

export const RECENT_PROJECT_LIMIT = 6;
export const RECENT_CHAT_LIMIT = 4;

export type HomeRecentChat = SessionChat & {
  sessionName: string;
  sessionProjectPath: string;
  sessionLastActivityAt: string | null;
};

function parseTime(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? -1 : parsed;
}

function chatActivityTime(chat: SessionChat): number {
  return Math.max(
    parseTime(chat.latestEventAt),
    parseTime(chat.lastActivityAt),
    parseTime(chat.updatedAt),
    parseTime(chat.createdAt),
  );
}

function displaySessionName(session: SessionSummary): string {
  const candidate = session.alias || session.projectName || session.id;
  const normalized = candidate.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || candidate;
}

function activityTime(session: SessionSummary): number {
  const chatTime = Math.max(...(session.recentChats ?? []).map(chatActivityTime), -1);
  return Math.max(parseTime(session.lastActivityAt), chatTime);
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

export function selectRecentChats(
  sessions: SessionSummary[],
  limit = RECENT_CHAT_LIMIT,
): HomeRecentChat[] {
  const count = Math.max(0, Math.floor(limit));

  return sessions
    .flatMap((session) => (session.recentChats ?? []).map((chat): HomeRecentChat => ({
      ...chat,
      sessionName: displaySessionName(session),
      sessionProjectPath: session.projectName || session.id,
      sessionLastActivityAt: session.lastActivityAt,
    })))
    .sort((a, b) => {
      const timeDelta = chatActivityTime(b) - chatActivityTime(a);
      if (timeDelta !== 0) return timeDelta;
      return a.id.localeCompare(b.id);
    })
    .slice(0, count);
}
