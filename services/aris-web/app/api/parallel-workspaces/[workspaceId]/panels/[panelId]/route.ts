import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import {
  deleteParallelWorkspacePanel,
  updateParallelWorkspacePanel,
} from '@/lib/parallelWorkspace/store';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; panelId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }
  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const { workspaceId, panelId } = await params;
    const body = await request.json();
    const workspace = await updateParallelWorkspacePanel({
      userId: auth.user.id,
      workspaceId,
      panelId,
      title: typeof body?.title === 'string' ? body.title : undefined,
      active: body?.active === true,
    });
    return NextResponse.json({ workspace, layout: workspace.layout });
  } catch (error) {
    if (error instanceof Error && error.message === 'PARALLEL_WORKSPACE_NOT_FOUND') {
      return NextResponse.json({ error: 'Parallel workspace not found' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'PARALLEL_PANEL_NOT_FOUND') {
      return NextResponse.json({ error: 'Parallel panel not found' }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Failed to update parallel panel';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ workspaceId: string; panelId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }
  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const { workspaceId, panelId } = await params;
    const workspace = await deleteParallelWorkspacePanel({
      userId: auth.user.id,
      workspaceId,
      panelId,
    });
    return NextResponse.json({ workspace, layout: workspace.layout });
  } catch (error) {
    if (error instanceof Error && error.message === 'PARALLEL_WORKSPACE_NOT_FOUND') {
      return NextResponse.json({ error: 'Parallel workspace not found' }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Failed to delete parallel panel';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
