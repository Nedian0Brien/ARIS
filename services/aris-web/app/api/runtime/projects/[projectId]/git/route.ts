import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import {
  getGitSidebarDiff,
  getGitSidebarOverview,
  performGitSidebarAction,
  type GitActionName,
  type GitDiffScope,
} from '@/lib/git/sidebar';
import {
  readWorkspacePanelIdFromRecord,
  readWorkspacePanelIdFromSearchParams,
  resolveWorkspacePanelExecutionTarget,
  WorkspacePanelExecutionTargetError,
} from '@/lib/workspacePanels/executionTarget';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function workspacePanelTargetErrorResponse(error: unknown): NextResponse | null {
  if (!(error instanceof WorkspacePanelExecutionTargetError)) return null;
  if (error.code === 'PROJECT_NOT_FOUND') {
    return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
  }
  return NextResponse.json({ error: '워크스페이스 패널을 찾을 수 없습니다.' }, { status: 404 });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const { projectId } = await context.params;
    const url = new URL(request.url);
    const target = await resolveWorkspacePanelExecutionTarget({
      userId: auth.user.id,
      projectId: projectId,
      workspacePanelId: readWorkspacePanelIdFromSearchParams(url.searchParams),
    });
    const projectPath = target.executionPath;
    const kind = (url.searchParams.get('kind') ?? 'overview').trim();

    if (kind === 'overview') {
      const overview = await getGitSidebarOverview(projectPath);
      return NextResponse.json(overview, {
        headers: { 'Cache-Control': 'no-store' },
      });
    }

    if (kind === 'diff') {
      const filePath = (url.searchParams.get('path') ?? '').trim();
      const scope = (url.searchParams.get('scope') ?? 'working').trim() as GitDiffScope;

      if (!filePath) {
        return NextResponse.json({ error: 'path is required' }, { status: 400 });
      }
      if (scope !== 'working' && scope !== 'staged') {
        return NextResponse.json({ error: 'scope must be working or staged' }, { status: 400 });
      }

      const diff = await getGitSidebarDiff(projectPath, filePath, scope);
      return NextResponse.json(
        { path: filePath, scope, diff },
        { headers: { 'Cache-Control': 'no-store' } },
      );
    }

    return NextResponse.json({ error: `Unsupported kind: ${kind}` }, { status: 400 });
  } catch (error) {
    const response = workspacePanelTargetErrorResponse(error);
    if (response) return response;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Git 정보를 불러오지 못했습니다.',
      },
      { status: 500 },
    );
  }
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const { projectId } = await context.params;
    const body = await request.json() as {
      action?: string;
      paths?: string[];
      message?: string;
      workspacePanelId?: string;
      panelId?: string;
    };
    const target = await resolveWorkspacePanelExecutionTarget({
      userId: auth.user.id,
      projectId: projectId,
      workspacePanelId: readWorkspacePanelIdFromRecord(body),
    });
    const projectPath = target.executionPath;

    const action = (body.action ?? '').trim() as GitActionName;
    const supportedActions: GitActionName[] = ['stage', 'unstage', 'commit', 'fetch', 'pull', 'push'];
    if (!supportedActions.includes(action)) {
      return NextResponse.json({ error: `Unsupported action: ${body.action ?? ''}` }, { status: 400 });
    }

    const result = await performGitSidebarAction(projectPath, {
      action,
      paths: Array.isArray(body.paths) ? body.paths : undefined,
      message: body.message,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    const response = workspacePanelTargetErrorResponse(error);
    if (response) return response;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Git 작업을 완료하지 못했습니다.',
      },
      { status: 500 },
    );
  }
}
