import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { deleteSessionChat, updateSessionChat } from '@/lib/happy/chats';

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; chatId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId, chatId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    agent?: string;
    isPinned?: boolean;
    threadId?: string | null;
    touchActivity?: boolean;
    lastReadAt?: string | null;
    lastReadEventId?: string | null;
  };

  try {
    const chat = await updateSessionChat({
      sessionId,
      userId: auth.user.id,
      chatId,
      title: body.title,
      agent: body.agent === 'claude' || body.agent === 'codex' || body.agent === 'gemini'
        ? body.agent
        : undefined,
      isPinned: body.isPinned,
      threadId: body.threadId,
      touchActivity: body.touchActivity,
      lastReadAt: body.lastReadAt,
      lastReadEventId: body.lastReadEventId,
    });
    return NextResponse.json({ chat });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update chat';
    if (message === 'CHAT_NOT_FOUND') {
      return NextResponse.json({ error: '채팅을 찾을 수 없습니다.' }, { status: 404 });
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string; chatId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const { sessionId, chatId } = await params;
    const result = await deleteSessionChat({
      sessionId,
      userId: auth.user.id,
      chatId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
