import { NextRequest } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSessions } from '@/lib/happy/client';
import { syncWorkspacesForUser } from '@/lib/happy/workspaces';
import { prisma } from '@/lib/db/prisma';
import { extractLastDirectoryName, resolveAgentFlavor } from '@/lib/happy/utils';
import { buildSessionChatMeta, buildAgentDistribution } from '@/lib/happy/chatStatsHelpers';
import type { GlobalChatStats, ChatSample } from '@/lib/happy/types';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 2000;

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const userId = auth.user.id;
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      // chatStats 캐시 변수 (start() 클로저 스코프)
      let cachedChatStats: GlobalChatStats | null = null;
      // perSession 집계도 별도 캐싱 — 캐시 히트 시에도 sessionList에 주입 가능
      let cachedSessionChatMeta: Map<string, { claude: number; codex: number; gemini: number; unknown: number; total: number }> | null = null;
      let chatStatsCachedAt = 0;
      const CHAT_STATS_TTL_MS = 10_000;

      const fetchAndSend = async () => {
        if (cancelled) return;
        try {
          const sessions = await listSessions();
          const workspaceMap = await syncWorkspacesForUser(userId, sessions);
          const sessionList = sessions.map((s) => {
            const workspace = workspaceMap.get(s.id);
            return {
              ...s,
              alias: workspace?.alias ?? null,
              isPinned: workspace?.isPinned ?? false,
              lastReadAt: workspace?.lastReadAt?.toISOString() ?? null,
              // chatAgentCounts, totalChats는 캐시된 perSession 데이터에서 나중에 주입
            };
          });

          // chatStats는 10초에 1회만 갱신
          const now = Date.now();
          if (!cachedChatStats || now - chatStatsCachedAt > CHAT_STATS_TTL_MS) {
            const runningSessionIds = sessions.filter(s => s.status === 'running').map(s => s.id);
            const runningCount = await prisma.sessionChat.count({
              where: { sessionId: { in: runningSessionIds }, latestEventIsUser: false, latestEventId: { not: null }, userId },
            });
            const runningSampleRows = await prisma.sessionChat.findMany({
              where: { sessionId: { in: runningSessionIds }, latestEventIsUser: false, latestEventId: { not: null }, userId },
              orderBy: { lastActivityAt: 'desc' }, take: 3,
              select: { id: true, title: true, sessionId: true, agent: true },
            });
            const completedNullCount = await prisma.sessionChat.count({
              where: { latestEventIsUser: false, latestEventId: { not: null }, userId, sessionId: { notIn: runningSessionIds }, lastReadAt: null },
            });
            const completedNonNullResult = await prisma.$queryRaw<[{ count: bigint }]>`
              SELECT COUNT(*)::bigint as count FROM "SessionChat"
              WHERE "userId" = ${userId}
                AND "latestEventIsUser" = false
                AND "latestEventId" IS NOT NULL
                AND "sessionId" != ALL(${runningSessionIds}::text[])
                AND "lastReadAt" IS NOT NULL AND "lastActivityAt" > "lastReadAt"
            `;
            const completedCount = completedNullCount + Number(completedNonNullResult[0]?.count ?? 0);
            const completedNullSample = await prisma.sessionChat.findMany({
              where: { latestEventIsUser: false, latestEventId: { not: null }, userId, sessionId: { notIn: runningSessionIds }, lastReadAt: null },
              orderBy: { lastActivityAt: 'desc' }, take: 5,
              select: { id: true, title: true, sessionId: true, agent: true, lastActivityAt: true },
            });
            const completedNonNullSample = await prisma.$queryRaw<Array<{ id: string; title: string; sessionId: string; agent: string; lastActivityAt: Date }>>`
              SELECT id, title, "sessionId", agent, "lastActivityAt" FROM "SessionChat"
              WHERE "userId" = ${userId} AND "latestEventIsUser" = false
                AND "latestEventId" IS NOT NULL
                AND "sessionId" != ALL(${runningSessionIds}::text[])
                AND "lastReadAt" IS NOT NULL AND "lastActivityAt" > "lastReadAt"
              ORDER BY "lastActivityAt" DESC LIMIT 5
            `;
            const completedSample = [...completedNullSample, ...completedNonNullSample]
              .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
              .slice(0, 5);
            const agentGroupBy = await prisma.sessionChat.groupBy({ by: ['agent'], where: { userId }, _count: { id: true } });
            const perSessionGroupBy = await prisma.sessionChat.groupBy({ by: ['sessionId', 'agent'], where: { userId }, _count: { id: true } });
            const sessionChatMeta = buildSessionChatMeta(perSessionGroupBy);
            const sessionNameById = new Map(sessions.map(s => {
              const ws = workspaceMap.get(s.id);
              return [s.id, ws?.alias || extractLastDirectoryName(s.projectName)];
            }));
            const toSample = (c: { id: string; title: string; sessionId: string; agent: string }): ChatSample => ({
              id: c.id, title: c.title || '(제목 없음)',
              sessionId: c.sessionId, sessionName: sessionNameById.get(c.sessionId) ?? c.sessionId,
              agent: resolveAgentFlavor(c.agent),
            });
            cachedSessionChatMeta = sessionChatMeta;  // 캐시 저장 — 캐시 히트 시에도 재사용
            cachedChatStats = {
              running: runningCount, completed: completedCount,
              agentDistribution: buildAgentDistribution(agentGroupBy),
              runningSample: runningSampleRows.map(toSample),
              completedSample: completedSample.map(toSample),
            };
            chatStatsCachedAt = now;
          }

          // 캐시 히트/미스 상관없이 항상 sessionList에 chatAgentCounts/totalChats 주입
          if (cachedSessionChatMeta) {
            for (const s of sessionList) {
              const meta = cachedSessionChatMeta.get(s.id);
              if (meta) {
                (s as typeof s & { chatAgentCounts?: object; totalChats?: number }).chatAgentCounts =
                  { claude: meta.claude, codex: meta.codex, gemini: meta.gemini, unknown: meta.unknown };
                (s as typeof s & { totalChats?: number }).totalChats = meta.total;
              }
            }
          }

          send({ sessions: sessionList, chatStats: cachedChatStats });
        } catch {
          // ignore, will retry on next tick
        }
      };

      await fetchAndSend();
      const timer = setInterval(() => {
        void fetchAndSend();
      }, POLL_INTERVAL_MS);

      request.signal.addEventListener('abort', () => {
        cancelled = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx reverse proxy에서 버퍼링 비활성화
    },
  });
}
