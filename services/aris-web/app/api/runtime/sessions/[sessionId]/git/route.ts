import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSessions } from '@/lib/happy/client';
import {
  getGitSidebarDiff,
  getGitSidebarOverview,
  performGitSidebarAction,
  type GitActionName,
  type GitDiffScope,
} from '@/lib/git/sidebar';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function resolveSessionProjectPath(userId: string, sessionId: string): Promise<string> {
  const sessions = await listSessions(userId);
  const target = sessions.find((session) => session.id === sessionId);
  if (!target) {
    throw new Error('워크스페이스 세션을 찾을 수 없습니다.');
  }
  return target.projectName;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const { sessionId } = await context.params;
    const projectPath = await resolveSessionProjectPath(auth.user.id, sessionId);
    const url = new URL(request.url);
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
  context: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const { sessionId } = await context.params;
    const projectPath = await resolveSessionProjectPath(auth.user.id, sessionId);
    const body = await request.json() as {
      action?: string;
      paths?: string[];
      message?: string;
    };

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
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : 'Git 작업을 완료하지 못했습니다.',
      },
      { status: 500 },
    );
  }
}
