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
    const body = (await request.json().catch(() => ({}))) as { title?: string };
    const chat = await createSessionChat({
      sessionId,
      userId: auth.user.id,
      title: body.title,
    });

    return NextResponse.json({ chat });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create chat';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
