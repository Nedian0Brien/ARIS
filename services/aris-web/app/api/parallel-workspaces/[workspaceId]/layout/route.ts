import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import {
  getParallelWorkspace,
  saveParallelWorkspaceLayout,
} from '@/lib/parallelWorkspace/store';
import { normalizeParallelWorkspaceLayout } from '@/lib/parallelWorkspace/layout';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }
  const { workspaceId } = await params;
  const workspace = await getParallelWorkspace(auth.user.id, workspaceId);
  if (!workspace) {
    return NextResponse.json({ error: 'Parallel workspace not found' }, { status: 404 });
  }
  return NextResponse.json({ workspace, layout: workspace.layout });
}

export async function PATCH(
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
    const current = await getParallelWorkspace(auth.user.id, workspaceId);
    if (!current) {
      return NextResponse.json({ error: 'Parallel workspace not found' }, { status: 404 });
    }
    const body = await request.json();
    const layout = normalizeParallelWorkspaceLayout(body?.layout ?? body, current.rootPath);
    const workspace = await saveParallelWorkspaceLayout({
      userId: auth.user.id,
      workspaceId,
      layout,
    });
    return NextResponse.json({ workspace, layout: workspace.layout });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update parallel workspace layout';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
