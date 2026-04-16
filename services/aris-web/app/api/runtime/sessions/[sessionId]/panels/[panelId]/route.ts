import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { deleteWorkspacePanel, updateWorkspacePanel } from '@/lib/happy/workspaces';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; panelId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId, panelId } = await params;

  try {
    const body = await request.json().catch(() => ({})) as {
      title?: unknown;
      config?: unknown;
    };

    const layout = await updateWorkspacePanel({
      userId: auth.user.id,
      workspaceId: sessionId,
      panelId,
      title: typeof body.title === 'string' ? body.title : undefined,
      config: body.config && typeof body.config === 'object' ? body.config as Record<string, unknown> : undefined,
    });

    return NextResponse.json({ layout });
  } catch (error) {
    if (error instanceof Error && error.message === 'WORKSPACE_NOT_FOUND') {
      return NextResponse.json({ error: '워크스페이스를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'PANEL_NOT_FOUND') {
      return NextResponse.json({ error: '패널을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ error: '패널 저장에 실패했습니다.' }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; panelId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId, panelId } = await params;

  try {
    const layout = await deleteWorkspacePanel({
      userId: auth.user.id,
      workspaceId: sessionId,
      panelId,
    });

    return NextResponse.json({ layout });
  } catch (error) {
    if (error instanceof Error && error.message === 'WORKSPACE_NOT_FOUND') {
      return NextResponse.json({ error: '워크스페이스를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'PANEL_NOT_FOUND') {
      return NextResponse.json({ error: '패널을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ error: '패널 삭제에 실패했습니다.' }, { status: 500 });
  }
}
