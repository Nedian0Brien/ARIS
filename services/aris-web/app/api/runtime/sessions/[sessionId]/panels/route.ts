import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { createWorkspacePanel, getWorkspacePanelLayout } from '@/lib/happy/workspaces';
import type { WorkspacePanelType } from '@/lib/workspacePanels/types';

function isWorkspacePanelType(value: unknown): value is WorkspacePanelType {
  return value === 'preview' || value === 'explorer' || value === 'terminal' || value === 'bookmark';
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId } = await params;

  try {
    const layout = await getWorkspacePanelLayout({
      userId: auth.user.id,
      workspaceId: sessionId,
    });

    return NextResponse.json({ layout });
  } catch (error) {
    if (error instanceof Error && error.message === 'WORKSPACE_NOT_FOUND') {
      return NextResponse.json({ error: '워크스페이스를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ error: '패널 레이아웃을 불러오지 못했습니다.' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId } = await params;

  try {
    const body = await request.json().catch(() => ({}));
    const type = body?.type;

    if (!isWorkspacePanelType(type)) {
      return NextResponse.json({ error: '유효한 패널 타입이 필요합니다.' }, { status: 400 });
    }

    const layout = await createWorkspacePanel({
      userId: auth.user.id,
      workspaceId: sessionId,
      type,
    });

    return NextResponse.json({ layout });
  } catch (error) {
    if (error instanceof Error && error.message === 'WORKSPACE_NOT_FOUND') {
      return NextResponse.json({ error: '워크스페이스를 찾을 수 없습니다.' }, { status: 404 });
    }

    return NextResponse.json({ error: '패널 생성에 실패했습니다.' }, { status: 500 });
  }
}
