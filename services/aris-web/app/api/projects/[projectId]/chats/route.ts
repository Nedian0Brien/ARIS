import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { createProjectChat, listProjectChats } from '@/lib/happy/projectChats';
import { getUserModelSettings } from '@/lib/settings/providerPreferences';

function isProjectChatConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Chat_model_allowed_check') || message.includes('SessionChat_model_allowed_check')
    || message.includes('Chat_model_reasoning_effort_check') || message.includes('SessionChat_model_reasoning_effort_check')
    || (message.includes('violates check constraint') && (message.includes('Chat') || message.includes('SessionChat')));
}

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
    const limitRaw = request.nextUrl.searchParams.get('limit');
    const limit = limitRaw ? Math.max(1, Math.floor(Number(limitRaw))) : undefined;
    const chats = await listProjectChats({
      projectId,
      userId: auth.user.id,
      ensureDefault: true,
      ...(Number.isFinite(limit) ? { limit } : {}),
    });
    return NextResponse.json({ chats });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load project chats';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(
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
    const chat = await createProjectChat({
      projectId,
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
    if (isProjectChatConstraintError(error)) {
      return NextResponse.json(
        {
          error: '유효하지 않은 채팅 설정입니다. model 또는 modelReasoningEffort 값을 확인해 주세요.',
          errorCode: 'INVALID_CHAT_CONFIG',
        },
        { status: 400 },
      );
    }
    const message = error instanceof Error ? error.message : 'Failed to create project chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
