import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listProjects, createProject } from '@/lib/happy/client';
import { filterProjectSummaries, syncWorkspacesForUser } from '@/lib/happy/workspaces';

function normalizeProjectPath(input: string): string {
  const normalized = input.replace(/\\/g, '/').trim();
  if (!normalized) return '';
  if (normalized === '/') return '/';
  return normalized.replace(/\/+$/, '');
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const projects = filterProjectSummaries(await listProjects(auth.user.id));
    await syncWorkspacesForUser(auth.user.id, projects);
    return NextResponse.json({ projects });
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
    const body = (await request.json().catch(() => ({}))) as {
      path?: string;
      agent?: string;
      approvalPolicy?: string;
      branch?: string;
    };
    const path = typeof body.path === 'string' ? normalizeProjectPath(body.path) : '';
    if (!path) {
      return NextResponse.json({ error: 'Path is required' }, { status: 400 });
    }

    const agent = body.agent === 'claude' || body.agent === 'codex' || body.agent === 'gemini'
      ? body.agent
      : 'claude';
    const approvalPolicy = body.approvalPolicy === 'on-request'
      || body.approvalPolicy === 'on-failure'
      || body.approvalPolicy === 'never'
      || body.approvalPolicy === 'yolo'
      ? body.approvalPolicy
      : 'on-request';
    const branch = typeof body.branch === 'string' && body.branch.trim() ? body.branch.trim() : undefined;

    const project = await createProject({ path, agent, approvalPolicy, branch });
    await syncWorkspacesForUser(auth.user.id, [project]);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create project';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
