import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listProjectChats } from '@/lib/happy/projectChats';
import { getProjectWorkspace, saveProjectWorkspace } from '@/lib/happy/projectWorkspaces';
import type { ProjectParallelPanelTreeState } from '@/app/projectParallelPanels';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const { projectId } = await params;
    const chats = await listProjectChats({ projectId, userId: auth.user.id, ensureDefault: false });
    const validChatIds = new Set(chats.map((chat) => chat.id));
    const workspace = await getProjectWorkspace({
      userId: auth.user.id,
      projectId,
      validChatIds,
    });
    return NextResponse.json({ workspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load project workspace';
    if (message === 'PROJECT_NOT_FOUND') {
      return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const { projectId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      layout?: ProjectParallelPanelTreeState | null;
    };
    const chats = await listProjectChats({ projectId, userId: auth.user.id, ensureDefault: false });
    const validChatIds = new Set(chats.map((chat) => chat.id));
    const workspace = await saveProjectWorkspace({
      userId: auth.user.id,
      projectId,
      layout: body.layout ?? null,
      validChatIds,
    });
    return NextResponse.json({ workspace });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save project workspace';
    if (message === 'PROJECT_NOT_FOUND') {
      return NextResponse.json({ error: '프로젝트를 찾을 수 없습니다.' }, { status: 404 });
    }
    if (message === 'INVALID_WORKSPACE_LAYOUT') {
      return NextResponse.json({ error: '유효하지 않은 workspace layout입니다.' }, { status: 400 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
