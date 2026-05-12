import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { createSession, getSessionDetail } from '@/lib/happy/client';
import { syncWorkspacesForUser } from '@/lib/happy/workspaces';
import type { AgentFlavor, ApprovalPolicy } from '@/lib/happy/types';
import {
  appendParallelWorkspacePanel,
  buildParallelPanelBranch,
  createParallelPanelRecord,
  getParallelWorkspace,
} from '@/lib/parallelWorkspace/store';

function normalizeAgent(value: unknown): AgentFlavor {
  return value === 'claude' || value === 'codex' || value === 'gemini' ? value : 'codex';
}

function normalizeApprovalPolicy(value: unknown): ApprovalPolicy {
  return value === 'on-request' || value === 'on-failure' || value === 'never' || value === 'yolo'
    ? value
    : 'on-request';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }
  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const { workspaceId } = await params;
    const workspace = await getParallelWorkspace(auth.user.id, workspaceId);
    if (!workspace) {
      return NextResponse.json({ error: 'Parallel workspace not found' }, { status: 404 });
    }

    const body = await request.json();
    const agent = normalizeAgent(body?.agent);
    const approvalPolicy = normalizeApprovalPolicy(body?.approvalPolicy);
    const title = typeof body?.title === 'string' && body.title.trim()
      ? body.title.trim().slice(0, 120)
      : `${agent} 패널`;
    const branch = buildParallelPanelBranch({
      rootPath: workspace.rootPath,
      title,
      agent,
    });
    const session = await createSession({
      path: workspace.rootPath,
      agent,
      approvalPolicy,
      branch,
    });
    await syncWorkspacesForUser(auth.user.id, [session]);
    const detail = await getSessionDetail(session.id, auth.user.id).catch(() => null);
    const panel = createParallelPanelRecord({
      sessionId: session.id,
      title,
      rootPath: workspace.rootPath,
      branch,
      worktreePath: detail?.hostPath,
      agent,
      approvalPolicy,
    });
    const nextWorkspace = await appendParallelWorkspacePanel({
      userId: auth.user.id,
      workspaceId,
      panel,
      afterPanelId: typeof body?.afterPanelId === 'string' ? body.afterPanelId : workspace.layout.activePanelId,
    });

    return NextResponse.json({
      workspace: nextWorkspace,
      layout: nextWorkspace.layout,
      panel,
      session,
    }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create parallel panel';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
