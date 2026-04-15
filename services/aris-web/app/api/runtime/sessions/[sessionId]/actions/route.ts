import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { runSessionAction, runWorkspaceDeleteAction } from '@/lib/happy/client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { sessionId } = await params;
  try {
    const body = await request.json();
    const chatId = typeof body?.chatId === 'string' && body.chatId.trim().length > 0
      ? body.chatId.trim()
      : undefined;
    const result = body?.action === 'kill' && !chatId
      ? await runWorkspaceDeleteAction(sessionId)
      : await runSessionAction(sessionId, body.action, { chatId });
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json({ error: 'Failed to run session action' }, { status: 500 });
  }
}
