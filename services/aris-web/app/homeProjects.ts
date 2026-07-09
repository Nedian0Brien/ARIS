import type { ProjectChat, ProjectSummary } from '@/lib/happy/types';

export const RECENT_PROJECT_LIMIT = 6;
export const RECENT_CHAT_LIMIT = 4;

export type HomeRecentChat = ProjectChat & {
  projectName: string;
  projectPath: string;
  projectLastActivityAt: string | null;
};

function parseTime(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isNaN(parsed) ? -1 : parsed;
}

function chatActivityTime(chat: ProjectChat): number {
  return Math.max(
    parseTime(chat.latestEventAt),
    parseTime(chat.lastActivityAt),
    parseTime(chat.updatedAt),
    parseTime(chat.createdAt),
  );
}

export function isChatEmpty(chat: ProjectChat): boolean {
  return chat.latestEventId == null && !(chat.latestPreview ?? '').trim();
}

function displayProjectName(project: ProjectSummary): string {
  const candidate = project.alias || project.projectName || project.id;
  const normalized = candidate.replace(/\\/g, '/').replace(/\/+$/, '');
  return normalized.split('/').filter(Boolean).pop() || candidate;
}

function activityTime(project: ProjectSummary): number {
  const chatTime = Math.max(...(project.recentChats ?? []).map(chatActivityTime), -1);
  return Math.max(parseTime(project.lastActivityAt), chatTime);
}

export function selectRecentProjects(
  projects: ProjectSummary[],
  limit = RECENT_PROJECT_LIMIT,
): ProjectSummary[] {
  const count = Math.max(0, Math.floor(limit));

  return [...projects]
    .sort((a, b) => {
      const timeDelta = activityTime(b) - activityTime(a);
      if (timeDelta !== 0) return timeDelta;
      return a.id.localeCompare(b.id);
    })
    .slice(0, count);
}

export function selectRecentChats(
  projects: ProjectSummary[],
  limit = RECENT_CHAT_LIMIT,
): HomeRecentChat[] {
  const count = Math.max(0, Math.floor(limit));

  return projects
    .flatMap((project) => (project.recentChats ?? [])
      .filter((chat) => !isChatEmpty(chat))
      .map((chat): HomeRecentChat => ({
        ...chat,
        projectId: chat.projectId ?? project.id,
        projectName: displayProjectName(project),
        projectPath: project.projectName || project.id,
        projectLastActivityAt: project.lastActivityAt,
      })))
    .sort((a, b) => {
      const timeDelta = chatActivityTime(b) - chatActivityTime(a);
      if (timeDelta !== 0) return timeDelta;
      return a.id.localeCompare(b.id);
    })
    .slice(0, count);
}
