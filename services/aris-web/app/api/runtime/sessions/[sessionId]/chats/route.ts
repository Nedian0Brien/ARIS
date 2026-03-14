import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { createSessionChat, listSessionChats } from '@/lib/happy/chats';
import { getUserModelSettings } from '@/lib/settings/providerPreferences';

function isSessionChatConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('SessionChat_model_allowed_check')
    || message.includes('SessionChat_model_reasoning_effort_check')
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
    const body = (await request.json().catch(() => ({}))) as {
      title?: string;
      agent?: string;
      model?: string | null;
      geminiMode?: string | null;
      modelReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
    };
    const normalizedAgent = body.agent === 'claude' || body.agent === 'codex' || body.agent === 'gemini'
      ? body.agent
      : 'codex';
    const settings = await getUserModelSettings(auth.user.id);
    const providerDefaults = settings.providers[normalizedAgent];
    const chat = await createSessionChat({
      sessionId,
      userId: auth.user.id,
      title: body.title,
      agent: normalizedAgent,
      model: body.model ?? providerDefaults.defaultModelId ?? providerDefaults.selectedModelIds[0] ?? null,
      geminiMode: normalizedAgent === 'gemini'
        ? (body.geminiMode ?? settings.providers.gemini.defaultModeId ?? null)
        : body.geminiMode,
      modelReasoningEffort: body.modelReasoningEffort,
    });

    return NextResponse.json({ chat });
  } catch (error) {
    if (isSessionChatConstraintError(error)) {
      return NextResponse.json(
        {
          error: '유효하지 않은 채팅 설정입니다. model 또는 modelReasoningEffort 값을 확인해 주세요.',
          errorCode: 'INVALID_CHAT_CONFIG',
        },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to create chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
