import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { createSessionChat, listSessionChats } from '@/lib/happy/chats';

function isSessionChatModelConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('SessionChat_model_allowed_check')
    || (message.includes('violates check constraint') && message.includes('SessionChat'));
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const { sessionId } = await params;
    const chats = await listSessionChats({
      sessionId,
      userId: auth.user.id,
      ensureDefault: true,
    });
    return NextResponse.json({ chats });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load chats';
    return NextResponse.json({ error: message }, { status: 500 });
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

  try {
    const { sessionId } = await params;
    const body = (await request.json().catch(() => ({}))) as { title?: string; agent?: string; model?: string | null };
    const normalizedAgent = body.agent === 'claude' || body.agent === 'codex' || body.agent === 'gemini'
      ? body.agent
      : 'codex';
    const chat = await createSessionChat({
      sessionId,
      userId: auth.user.id,
      title: body.title,
      agent: normalizedAgent,
      model: body.model,
    });

    return NextResponse.json({ chat });
  } catch (error) {
    if (isSessionChatModelConstraintError(error)) {
      return NextResponse.json(
        { error: '유효하지 않은 모델입니다. 허용 모델 또는 커스텀 패턴에 맞는 모델만 저장할 수 있습니다.' },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to create chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
