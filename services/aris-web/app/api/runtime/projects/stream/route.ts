import { NextRequest } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listProjects } from '@/lib/happy/client';
import { syncWorkspacesForUser } from '@/lib/happy/workspaces';
import { prisma } from '@/lib/db/prisma';
import { extractLastDirectoryName, resolveAgentFlavor } from '@/lib/happy/utils';
import { buildProjectChatMeta, buildAgentDistribution } from '@/lib/happy/chatStatsHelpers';
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
      // perProject 집계도 별도 캐싱 — 캐시 히트 시에도 projectList에 주입 가능
      let cachedProjectChatMeta: Map<string, { claude: number; codex: number; gemini: number; unknown: number; total: number }> | null = null;
      let chatStatsCachedAt = 0;
      const CHAT_STATS_TTL_MS = 10_000;

      const fetchAndSend = async () => {
        if (cancelled) return;
        try {
          const projects = await listProjects();
          const workspaceMap = await syncWorkspacesForUser(userId, projects);
          const projectList = projects.map((s) => {
            const workspace = workspaceMap.get(s.id);
            return {
              ...s,
              alias: workspace?.alias ?? null,
              isPinned: workspace?.isPinned ?? false,
              lastReadAt: workspace?.lastReadAt?.toISOString() ?? null,
              // chatAgentCounts, totalChats는 캐시된 perProject 데이터에서 나중에 주입
            };
          });

          // chatStats는 10초에 1회만 갱신
          const now = Date.now();
          if (!cachedChatStats || now - chatStatsCachedAt > CHAT_STATS_TTL_MS) {
            const runningProjectIds = projects.filter(s => s.status === 'running').map(s => s.id);
            const runningCount = await prisma.chat.count({
              where: { projectId: { in: runningProjectIds }, latestEventIsUser: false, latestEventId: { not: null }, userId, parentChatId: null, subagentStatus: null },
            });
            const runningSampleRows = await prisma.chat.findMany({
              where: { projectId: { in: runningProjectIds }, latestEventIsUser: false, latestEventId: { not: null }, userId, parentChatId: null, subagentStatus: null },
              orderBy: { lastActivityAt: 'desc' }, take: 3,
              select: { id: true, title: true, projectId: true, agent: true },
            });
            const completedNullCount = await prisma.chat.count({
              where: { latestEventIsUser: false, latestEventId: { not: null }, userId, projectId: { notIn: runningProjectIds }, lastReadAt: null, parentChatId: null, subagentStatus: null },
            });
            const completedNonNullResult = await prisma.$queryRaw<[{ count: bigint }]>`
              SELECT COUNT(*)::bigint as count FROM "Chat"
              WHERE "userId" = ${userId}
                AND "latestEventIsUser" = false
                AND "latestEventId" IS NOT NULL
                AND "projectId" != ALL(${runningProjectIds}::text[])
                AND "lastReadAt" IS NOT NULL AND "lastActivityAt" > "lastReadAt"
                AND "parentChatId" IS NULL AND "subagentStatus" IS NULL
            `;
            const completedCount = completedNullCount + Number(completedNonNullResult[0]?.count ?? 0);
            const completedNullSample = await prisma.chat.findMany({
              where: { latestEventIsUser: false, latestEventId: { not: null }, userId, projectId: { notIn: runningProjectIds }, lastReadAt: null, parentChatId: null, subagentStatus: null },
              orderBy: { lastActivityAt: 'desc' }, take: 5,
              select: { id: true, title: true, projectId: true, agent: true, lastActivityAt: true },
            });
            const completedNonNullSample = await prisma.$queryRaw<Array<{ id: string; title: string; projectId: string; agent: string; lastActivityAt: Date }>>`
              SELECT id, title, "projectId", agent, "lastActivityAt" FROM "Chat"
              WHERE "userId" = ${userId} AND "latestEventIsUser" = false
                AND "latestEventId" IS NOT NULL
                AND "projectId" != ALL(${runningProjectIds}::text[])
                AND "lastReadAt" IS NOT NULL AND "lastActivityAt" > "lastReadAt"
                AND "parentChatId" IS NULL AND "subagentStatus" IS NULL
              ORDER BY "lastActivityAt" DESC LIMIT 5
            `;
            const completedSample = [...completedNullSample, ...completedNonNullSample]
              .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
              .slice(0, 5);
            const agentGroupBy = await prisma.chat.groupBy({ by: ['agent'], where: { userId, parentChatId: null, subagentStatus: null }, _count: { id: true } });
            const perProjectGroupBy = await prisma.chat.groupBy({ by: ['projectId', 'agent'], where: { userId, parentChatId: null, subagentStatus: null }, _count: { id: true } });
            const projectChatMeta = buildProjectChatMeta(perProjectGroupBy);
            const projectNameById = new Map(projects.map(s => {
              const ws = workspaceMap.get(s.id);
              return [s.id, ws?.alias || extractLastDirectoryName(s.projectName)];
            }));
            const toSample = (c: { id: string; title: string; projectId: string; agent: string }): ChatSample => {
              const projectId = c.projectId;
              return {
                id: c.id, title: c.title || '(제목 없음)',
                projectId, projectName: projectNameById.get(projectId) ?? projectId,
                agent: resolveAgentFlavor(c.agent),
              };
            };
            cachedProjectChatMeta = projectChatMeta;  // 캐시 저장 — 캐시 히트 시에도 재사용
            cachedChatStats = {
              running: runningCount, completed: completedCount,
              agentDistribution: buildAgentDistribution(agentGroupBy),
              runningSample: runningSampleRows.map(toSample),
              completedSample: completedSample.map(toSample),
            };
            chatStatsCachedAt = now;
          }

          // 캐시 히트/미스 상관없이 항상 projectList에 chatAgentCounts/totalChats 주입
          if (cachedProjectChatMeta) {
            for (const s of projectList) {
              const meta = cachedProjectChatMeta.get(s.id);
              if (meta) {
                (s as typeof s & { chatAgentCounts?: object; totalChats?: number }).chatAgentCounts =
                  { claude: meta.claude, codex: meta.codex, gemini: meta.gemini, unknown: meta.unknown };
                (s as typeof s & { totalChats?: number }).totalChats = meta.total;
              }
            }
          }

          send({ projects: projectList, chatStats: cachedChatStats });
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
