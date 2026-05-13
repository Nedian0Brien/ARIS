import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { deleteProjectChat, updateProjectChat } from '@/lib/happy/projectChats';

function isProjectChatConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('SessionChat_model_allowed_check')
    || message.includes('SessionChat_model_reasoning_effort_check')
    || (message.includes('violates check constraint') && message.includes('SessionChat'));
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; chatId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { projectId, chatId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    title?: string;
    agent?: string;
    isPinned?: boolean;
    threadId?: string | null;
    touchActivity?: boolean;
    model?: string | null;
    geminiMode?: string | null;
    modelReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
    lastReadAt?: string | null;
    lastReadEventId?: string | null;
    latestPreview?: string;
    latestEventId?: string | null;
    latestEventAt?: string | null;
    latestEventIsUser?: boolean;
    latestHasErrorSignal?: boolean;
  };

  try {
    const chat = await updateProjectChat({
      projectId,
      userId: auth.user.id,
      chatId,
      title: body.title,
      agent: body.agent === 'claude' || body.agent === 'codex' || body.agent === 'gemini'
        ? body.agent
        : undefined,
      isPinned: body.isPinned,
      threadId: body.threadId,
      touchActivity: body.touchActivity,
      model: body.model,
      geminiMode: body.geminiMode,
      modelReasoningEffort: body.modelReasoningEffort,
      lastReadAt: body.lastReadAt,
      lastReadEventId: body.lastReadEventId,
      latestPreview: body.latestPreview,
      latestEventId: body.latestEventId,
      latestEventAt: body.latestEventAt,
      latestEventIsUser: body.latestEventIsUser,
      latestHasErrorSignal: body.latestHasErrorSignal,
    });
    return NextResponse.json({ chat });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update project chat';
    if (message === 'CHAT_NOT_FOUND') {
      return NextResponse.json({ error: '채팅을 찾을 수 없습니다.' }, { status: 404 });
    }
    if (isProjectChatConstraintError(error)) {
      return NextResponse.json(
        {
          error: '유효하지 않은 채팅 설정입니다. model 또는 modelReasoningEffort 값을 확인해 주세요.',
          errorCode: 'INVALID_CHAT_CONFIG',
        },
        { status: 400 },
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; chatId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const { projectId, chatId } = await params;
    const result = await deleteProjectChat({
      projectId,
      userId: auth.user.id,
      chatId,
    });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to delete project chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
