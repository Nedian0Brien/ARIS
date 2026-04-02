import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSessions, createSession } from '@/lib/happy/client';
import { syncWorkspacesForUser } from '@/lib/happy/workspaces';

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

    const mergedSessions = sessions.map(s => {
      const workspace = workspaceMap.get(s.id);
      return {
        ...s,
        alias: workspace?.alias || null,
        isPinned: workspace?.isPinned ?? false,
        lastReadAt: workspace?.lastReadAt?.toISOString() ?? null,
      };
    });

    return NextResponse.json({ sessions: mergedSessions });
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
