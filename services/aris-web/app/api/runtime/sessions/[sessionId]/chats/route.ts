import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { createSessionChat, listSessionChats } from '@/lib/happy/chats';

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
    const defaultAgentRaw = request.nextUrl.searchParams.get('defaultAgent');
    const defaultAgent = defaultAgentRaw === 'claude' || defaultAgentRaw === 'codex' || defaultAgentRaw === 'gemini'
      ? defaultAgentRaw
      : undefined;
    const chats = await listSessionChats({
      sessionId,
      userId: auth.user.id,
      ensureDefault: true,
      defaultAgent,
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
    const body = (await request.json().catch(() => ({}))) as { title?: string; agent?: string };
    const chat = await createSessionChat({
      sessionId,
      userId: auth.user.id,
      title: body.title,
      agent: body.agent === 'claude' || body.agent === 'codex' || body.agent === 'gemini' ? body.agent : undefined,
    });

    return NextResponse.json({ chat });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
