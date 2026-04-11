import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSessions, createSession } from '@/lib/happy/client';
import { syncWorkspacesForUser } from '@/lib/happy/workspaces';
import { prisma } from '@/lib/db/prisma';
import { extractLastDirectoryName, resolveAgentFlavor } from '@/lib/happy/utils';
import { buildSessionChatMeta, buildAgentDistribution } from '@/lib/happy/chatStatsHelpers';
import type { GlobalChatStats, ChatSample } from '@/lib/happy/types';

function normalizeProjectPath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim();
  if (!normalized) {
    return '';
  }
  if (normalized === '/') {
    return '/';
  }
  return normalized.replace(/\/+$/, '');
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const sessions = await listSessions();
    const workspaceMap = await syncWorkspacesForUser(auth.user.id, sessions);

    const userId = auth.user.id;
    const runningSessionIds = sessions.filter(s => s.status === 'running').map(s => s.id);

    // running 채팅 집계
    const runningCount = await prisma.sessionChat.count({
      where: { sessionId: { in: runningSessionIds }, latestEventIsUser: false, latestEventId: { not: null }, userId },
    });
    const runningSampleRows = await prisma.sessionChat.findMany({
      where: { sessionId: { in: runningSessionIds }, latestEventIsUser: false, latestEventId: { not: null }, userId },
      orderBy: { lastActivityAt: 'desc' },
      take: 3,
      select: { id: true, title: true, sessionId: true, agent: true },
    });

    // completed 채팅 집계
    const completedNullCount = await prisma.sessionChat.count({
      where: { latestEventIsUser: false, latestEventId: { not: null }, userId, sessionId: { notIn: runningSessionIds }, lastReadAt: null },
    });
    const completedNonNullResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint as count
      FROM "SessionChat"
      WHERE "userId" = ${userId}
        AND "latestEventIsUser" = false
        AND "latestEventId" IS NOT NULL
        AND "sessionId" != ALL(${runningSessionIds}::text[])
        AND "lastReadAt" IS NOT NULL
        AND "lastActivityAt" > "lastReadAt"
    `;
    const completedCount = completedNullCount + Number(completedNonNullResult[0]?.count ?? 0);

    const completedNullSample = await prisma.sessionChat.findMany({
      where: { latestEventIsUser: false, latestEventId: { not: null }, userId, sessionId: { notIn: runningSessionIds }, lastReadAt: null },
      orderBy: { lastActivityAt: 'desc' }, take: 5,
      select: { id: true, title: true, sessionId: true, agent: true, lastActivityAt: true },
    });
    const completedNonNullSample = await prisma.$queryRaw<Array<{ id: string; title: string; sessionId: string; agent: string; lastActivityAt: Date }>>`
      SELECT id, title, "sessionId", agent, "lastActivityAt"
      FROM "SessionChat"
      WHERE "userId" = ${userId}
        AND "latestEventIsUser" = false
        AND "latestEventId" IS NOT NULL
        AND "sessionId" != ALL(${runningSessionIds}::text[])
        AND "lastReadAt" IS NOT NULL
        AND "lastActivityAt" > "lastReadAt"
      ORDER BY "lastActivityAt" DESC
      LIMIT 5
    `;
    const completedSample = [...completedNullSample, ...completedNonNullSample]
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
      .slice(0, 5);

    // 에이전트 분포
    const agentGroupBy = await prisma.sessionChat.groupBy({
      by: ['agent'], where: { userId }, _count: { id: true },
    });

    // 세션별 채팅 에이전트 분포
    const perSessionGroupBy = await prisma.sessionChat.groupBy({
      by: ['sessionId', 'agent'], where: { userId }, _count: { id: true },
    });
    const sessionChatMeta = buildSessionChatMeta(perSessionGroupBy);

    // sessionName 맵 (alias 우선, 없으면 경로 마지막 세그먼트)
    const sessionNameById = new Map(
      sessions.map(s => {
        const ws = workspaceMap.get(s.id);
        return [s.id, ws?.alias || extractLastDirectoryName(s.projectName)];
      })
    );

    // sessions에 chatAgentCounts, totalChats 주입
    const mergedSessions = sessions.map(s => {
      const meta = sessionChatMeta.get(s.id);
      const workspace = workspaceMap.get(s.id);
      return {
        ...s,
        alias: workspace?.alias ?? null,
        isPinned: workspace?.isPinned ?? false,
        lastReadAt: workspace?.lastReadAt?.toISOString() ?? null,
        chatAgentCounts: meta
          ? { claude: meta.claude, codex: meta.codex, gemini: meta.gemini, unknown: meta.unknown }
          : undefined,
        totalChats: meta?.total,
      };
    });

    const toSample = (c: { id: string; title: string; sessionId: string; agent: string; lastActivityAt?: Date }): ChatSample => ({
      id: c.id,
      title: c.title || '(제목 없음)',
      sessionId: c.sessionId,
      sessionName: sessionNameById.get(c.sessionId) ?? c.sessionId,
      agent: resolveAgentFlavor(c.agent),
    });

    const chatStats: GlobalChatStats = {
      running: runningCount,
      completed: completedCount,
      agentDistribution: buildAgentDistribution(agentGroupBy),
      runningSample: runningSampleRows.map(toSample),
      completedSample: completedSample.map(toSample),
    };

    return NextResponse.json({ sessions: mergedSessions, chatStats });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load sessions';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}


export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { path, agent, approvalPolicy, branch } = body as {
      path?: string;
      agent?: string;
      approvalPolicy?: string;
      branch?: string;
    };
    const normalizedPolicy = approvalPolicy === 'on-request'
      || approvalPolicy === 'on-failure'
      || approvalPolicy === 'never'
      || approvalPolicy === 'yolo'
      ? approvalPolicy
      : 'on-request';
    const normalizedPath = typeof path === 'string' ? normalizeProjectPath(path) : '';

    // agent 미전달 시 'claude' 기본값 (에러 반환하지 않음)
    const normalizedAgent = agent === 'claude' || agent === 'codex' || agent === 'gemini'
      ? agent
      : 'claude';

    if (!normalizedPath) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    const existingSessions = await listSessions();
    const existing = existingSessions.find((session) => normalizeProjectPath(session.projectName) === normalizedPath);
    if (existing) {
      await syncWorkspacesForUser(auth.user.id, [existing]);
      return NextResponse.json({ session: existing, reused: true });
    }

    const normalizedBranch = typeof branch === 'string' && branch.trim() ? branch.trim() : undefined;
    const session = await createSession({ path: normalizedPath, agent: normalizedAgent, approvalPolicy: normalizedPolicy, branch: normalizedBranch });
    await syncWorkspacesForUser(auth.user.id, [session]);
    return NextResponse.json({ session, reused: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
