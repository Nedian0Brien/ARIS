import type { SessionChat as PrismaSessionChat } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';
import { buildSessionChatMeta } from '@/lib/happy/chatStatsHelpers';
import type { SessionChat, SessionSummary } from '@/lib/happy/types';
import { resolveAgentFlavor } from '@/lib/happy/utils';

function normalizeModelReasoningEffort(input: string | null): SessionChat['modelReasoningEffort'] {
  if (input === 'low' || input === 'medium' || input === 'high' || input === 'xhigh') {
    return input;
  }
  return null;
}

function toSessionChat(record: PrismaSessionChat): SessionChat {
  return {
    id: record.id,
    sessionId: record.sessionId,
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

export async function enrichSessionsWithRecentChats(
  userId: string,
  sessions: SessionSummary[],
  recentPerSession = 2,
): Promise<SessionSummary[]> {
  const sessionIds = sessions.map((session) => session.id);
  if (sessionIds.length === 0) {
    return sessions;
  }

  const [perSessionGroupBy, recentChatGroups] = await Promise.all([
    prisma.sessionChat.groupBy({
      by: ['sessionId', 'agent'],
      where: { userId, sessionId: { in: sessionIds } },
      _count: { id: true },
    }),
    Promise.all(sessionIds.map((sessionId) => prisma.sessionChat.findMany({
      where: { userId, sessionId },
      orderBy: [{ lastActivityAt: 'desc' }, { createdAt: 'desc' }],
      take: Math.max(0, Math.floor(recentPerSession)),
    }))),
  ]);

  const chatMeta = buildSessionChatMeta(perSessionGroupBy);
  const recentChatsBySession = new Map<string, SessionChat[]>();

  for (const group of recentChatGroups) {
    for (const chat of group) {
      const entry = recentChatsBySession.get(chat.sessionId) ?? [];
      entry.push(toSessionChat(chat));
      recentChatsBySession.set(chat.sessionId, entry);
    }
  }

  return sessions.map((session) => {
    const meta = chatMeta.get(session.id);

    return {
      ...session,
      chatAgentCounts: meta
        ? { claude: meta.claude, codex: meta.codex, gemini: meta.gemini, unknown: meta.unknown }
        : undefined,
      totalChats: meta?.total ?? 0,
      recentChats: recentChatsBySession.get(session.id) ?? [],
    };
  });
}
