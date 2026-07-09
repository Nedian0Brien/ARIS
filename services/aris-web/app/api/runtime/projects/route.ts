import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listProjects, createProject } from '@/lib/happy/client';
import { syncWorkspacesForUser } from '@/lib/happy/workspaces';
import { prisma } from '@/lib/db/prisma';
import { extractLastDirectoryName, resolveAgentFlavor } from '@/lib/happy/utils';
import { buildProjectChatMeta, buildAgentDistribution } from '@/lib/happy/chatStatsHelpers';
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
    const projects = await listProjects();
    const workspaceMap = await syncWorkspacesForUser(auth.user.id, projects);

    const userId = auth.user.id;
    const runningProjectIds = projects.filter(s => s.status === 'running').map(s => s.id);

    // running 채팅 집계
    const runningCount = await prisma.chat.count({
      where: { projectId: { in: runningProjectIds }, latestEventIsUser: false, latestEventId: { not: null }, userId, parentChatId: null, subagentStatus: null },
    });
    const runningSampleRows = await prisma.chat.findMany({
      where: { projectId: { in: runningProjectIds }, latestEventIsUser: false, latestEventId: { not: null }, userId, parentChatId: null, subagentStatus: null },
      orderBy: { lastActivityAt: 'desc' },
      take: 3,
      select: { id: true, title: true, projectId: true, agent: true },
    });

    // completed 채팅 집계
    const completedNullCount = await prisma.chat.count({
      where: { latestEventIsUser: false, latestEventId: { not: null }, userId, projectId: { notIn: runningProjectIds }, lastReadAt: null, parentChatId: null, subagentStatus: null },
    });
    const completedNonNullResult = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint as count
      FROM "Chat"
      WHERE "userId" = ${userId}
        AND "latestEventIsUser" = false
        AND "latestEventId" IS NOT NULL
        AND "projectId" != ALL(${runningProjectIds}::text[])
        AND "lastReadAt" IS NOT NULL
        AND "lastActivityAt" > "lastReadAt"
        AND "parentChatId" IS NULL
        AND "subagentStatus" IS NULL
    `;
    const completedCount = completedNullCount + Number(completedNonNullResult[0]?.count ?? 0);

    const completedNullSample = await prisma.chat.findMany({
      where: { latestEventIsUser: false, latestEventId: { not: null }, userId, projectId: { notIn: runningProjectIds }, lastReadAt: null, parentChatId: null, subagentStatus: null },
      orderBy: { lastActivityAt: 'desc' }, take: 5,
      select: { id: true, title: true, projectId: true, agent: true, lastActivityAt: true },
    });
    const completedNonNullSample = await prisma.$queryRaw<Array<{ id: string; title: string; projectId: string; agent: string; lastActivityAt: Date }>>`
      SELECT id, title, "projectId", agent, "lastActivityAt"
      FROM "Chat"
      WHERE "userId" = ${userId}
        AND "latestEventIsUser" = false
        AND "latestEventId" IS NOT NULL
        AND "projectId" != ALL(${runningProjectIds}::text[])
        AND "lastReadAt" IS NOT NULL
        AND "lastActivityAt" > "lastReadAt"
        AND "parentChatId" IS NULL
        AND "subagentStatus" IS NULL
      ORDER BY "lastActivityAt" DESC
      LIMIT 5
    `;
    const completedSample = [...completedNullSample, ...completedNonNullSample]
      .sort((a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime())
      .slice(0, 5);

    // 에이전트 분포
    const agentGroupBy = await prisma.chat.groupBy({
      by: ['agent'], where: { userId, parentChatId: null, subagentStatus: null }, _count: { id: true },
    });

    // 세션별 채팅 에이전트 분포
    const perProjectGroupBy = await prisma.chat.groupBy({
      by: ['projectId', 'agent'], where: { userId, parentChatId: null, subagentStatus: null }, _count: { id: true },
    });
    const projectChatMeta = buildProjectChatMeta(perProjectGroupBy);

    const projectNameById = new Map(
      projects.map(s => {
        const ws = workspaceMap.get(s.id);
        return [s.id, ws?.alias || extractLastDirectoryName(s.projectName)];
      })
    );

    // projects에 chatAgentCounts, totalChats 주입
    const mergedProjects = projects.map(s => {
      const meta = projectChatMeta.get(s.id);
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

    const toSample = (c: { id: string; title: string; projectId: string; agent: string; lastActivityAt?: Date }): ChatSample => {
      const projectId = c.projectId;
      return {
        id: c.id,
        title: c.title || '(제목 없음)',
        projectId,
        projectName: projectNameById.get(projectId) ?? projectId,
        agent: resolveAgentFlavor(c.agent),
      };
    };

    const chatStats: GlobalChatStats = {
      running: runningCount,
      completed: completedCount,
      agentDistribution: buildAgentDistribution(agentGroupBy),
      runningSample: runningSampleRows.map(toSample),
      completedSample: completedSample.map(toSample),
    };

    return NextResponse.json({ projects: mergedProjects, chatStats });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load projects';
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

    const normalizedBranch = typeof branch === 'string' && branch.trim() ? branch.trim() : undefined;
    const existingProjects = await listProjects();
    const existing = normalizedBranch
      ? existingProjects.find((project) => (
        normalizeProjectPath(project.projectName) === normalizedPath
        && project.branch === normalizedBranch
        && project.metadata?.runtimeModel === 'chat-stream'
      ))
      : existingProjects.find((project) => {
        if (normalizeProjectPath(project.projectName) !== normalizedPath) {
          return false;
        }
        if (project.branch) {
          return false;
        }
        return project.metadata?.runtimeModel === 'chat-stream';
      });
    if (existing) {
      await syncWorkspacesForUser(auth.user.id, [existing]);
      return NextResponse.json({ project: existing, reused: true });
    }

    const project = await createProject({ path: normalizedPath, agent: normalizedAgent, approvalPolicy: normalizedPolicy, branch: normalizedBranch });
    await syncWorkspacesForUser(auth.user.id, [project]);
    return NextResponse.json({ project, reused: false });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create project';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
