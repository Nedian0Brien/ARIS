import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { runChatTerminalCommand, HappyHttpError } from '@/lib/happy/client';
import { getWorkspaceById } from '@/lib/happy/workspaces';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }
  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const { sessionId } = await params;
  const body = await request.json().catch(() => ({})) as {
    chatId?: string;
    command?: string;
    agent?: string;
    model?: string;
    modelReasoningEffort?: string;
  };
  const command = typeof body.command === 'string' ? body.command.trim() : '';
  const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : '';
  if (!command || !chatId) {
    return NextResponse.json({ error: 'chatId and command are required' }, { status: 400 });
  }

  const workspace = await getWorkspaceById(auth.user.id, sessionId);
  if (!workspace) {
    return NextResponse.json({ error: 'WORKSPACE_NOT_FOUND' }, { status: 404 });
  }

  try {
    const events = await runChatTerminalCommand({
      sessionId,
      chatId,
      command,
    });

    return NextResponse.json({ events });
  } catch (error) {
    if (error instanceof HappyHttpError && [401, 403, 404].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : '터미널 명령 실행에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
