import type { Chat as PrismaChat } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildProjectChatMeta } from '@/lib/happy/chatStatsHelpers';
import type { ProjectChat, ProjectSummary } from '@/lib/happy/types';
import { resolveAgentFlavor } from '@/lib/happy/utils';

function normalizeModelReasoningEffort(input: string | null): ProjectChat['modelReasoningEffort'] {
  if (input === 'low' || input === 'medium' || input === 'high' || input === 'xhigh') {
    return input;
  }
  return null;
}

function toProjectChat(record: PrismaChat): ProjectChat {
  return {
    id: record.id,
    projectId: record.projectId,
    agent: resolveAgentFlavor(record.agent),
    model: record.model,
    geminiMode: record.geminiMode,
    modelReasoningEffort: normalizeModelReasoningEffort(record.modelReasoningEffort),
    title: record.title,
    isPinned: record.isPinned,
    isDefault: record.isDefault,
    threadId: record.threadId,
    latestPreview: record.latestPreview,
    latestEventId: record.latestEventId,
    latestEventAt: record.latestEventAt ? record.latestEventAt.toISOString() : null,
    latestEventIsUser: record.latestEventIsUser,
    latestHasErrorSignal: record.latestHasErrorSignal,
    lastReadAt: record.lastReadAt ? record.lastReadAt.toISOString() : null,
    lastReadEventId: record.lastReadEventId,
    lastActivityAt: record.lastActivityAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

export async function enrichProjectsWithRecentChats(
  userId: string,
  projects: ProjectSummary[],
  recentPerSession = 5,
): Promise<ProjectSummary[]> {
  const projectIds = projects.map((project) => project.id);
  if (projectIds.length === 0) {
    return projects;
  }

  const [perSessionGroupBy, recentChatGroups] = await Promise.all([
    prisma.chat.groupBy({
      by: ['projectId', 'agent'],
      // Exclude imported subagent transcripts from per-project chat counts.
      where: { userId, projectId: { in: projectIds }, parentChatId: null, subagentStatus: null },
      _count: { id: true },
    }),
    Promise.all(projectIds.map((projectId) => prisma.chat.findMany({
      // Subagent transcripts must not surface as recent chats on the home screen.
      where: { userId, projectId, parentChatId: null, subagentStatus: null },
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(0, Math.floor(recentPerSession)),
    }))),
  ]);

  const chatMeta = buildProjectChatMeta(perSessionGroupBy);
  const recentChatsByProject = new Map<string, ProjectChat[]>();

  for (const group of recentChatGroups) {
    for (const chat of group) {
      const entry = recentChatsByProject.get(chat.projectId) ?? [];
      entry.push(toProjectChat(chat));
      recentChatsByProject.set(chat.projectId, entry);
    }
  }

  return projects.map((project) => {
    const meta = chatMeta.get(project.id);

    return {
      ...project,
      chatAgentCounts: meta
        ? { claude: meta.claude, codex: meta.codex, gemini: meta.gemini, unknown: meta.unknown }
        : undefined,
      totalChats: meta?.total ?? 0,
      recentChats: recentChatsByProject.get(project.id) ?? [],
    };
  });
}
