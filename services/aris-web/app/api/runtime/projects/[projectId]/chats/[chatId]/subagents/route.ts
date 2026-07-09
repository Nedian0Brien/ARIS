import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSubagentChats } from '@/lib/happy/chats';

/**
 * List the imported subagent (Task tool) transcripts that belong to a chat.
 * These are hidden from the main chat list and surfaced only here, in the
 * right-sidebar subagent panel.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; chatId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const { chatId } = await params;
    const subagents = await listSubagentChats({
      parentChatId: chatId,
      userId: auth.user.id,
    });
    return NextResponse.json({ subagents });
  } catch {
    return NextResponse.json({ error: '서브에이전트 목록을 불러오지 못했습니다.' }, { status: 500 });
  }
}
