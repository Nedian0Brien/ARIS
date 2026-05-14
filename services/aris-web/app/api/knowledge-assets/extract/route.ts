import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { extractKnowledgeAssetsForChat } from '@/lib/ask/knowledge';

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as { chatId?: string; runId?: string | null };
  const chatId = typeof body.chatId === 'string' ? body.chatId.trim() : '';
  if (!chatId) {
    return NextResponse.json({ error: 'chatId가 필요합니다.' }, { status: 400 });
  }

  const assets = await extractKnowledgeAssetsForChat({
    userId: auth.user.id,
    chatId,
    runId: typeof body.runId === 'string' && body.runId.trim() ? body.runId.trim() : null,
  });

  return NextResponse.json({ assets });
}
