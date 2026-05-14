import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { searchExternalSources } from '@/lib/ask/externalSearch';
import {
  appendAskExchange,
  buildAskAnswerDraft,
  getProjectCandidates,
  listKnowledgeAssets,
} from '@/lib/ask/knowledge';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ threadId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { threadId } = await params;
  const body = (await request.json().catch(() => ({}))) as { content?: string };
  const query = typeof body.content === 'string' ? body.content.trim() : '';
  if (!query) {
    return NextResponse.json({ error: '질문을 입력해 주세요.' }, { status: 400 });
  }

  try {
    const [memories, externalResults, projectCandidates] = await Promise.all([
      listKnowledgeAssets({ userId: auth.user.id, query, status: 'all', kind: 'all', limit: 8 }),
      searchExternalSources(query),
      getProjectCandidates(auth.user.id, query),
    ]);
    const draft = buildAskAnswerDraft({
      query,
      memories,
      externalResults,
      projectCandidates,
    });
    const messages = await appendAskExchange({
      userId: auth.user.id,
      threadId,
      query,
      draft,
    });

    return NextResponse.json({
      draft,
      messages,
      memories,
      externalResults,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'ASK_THREAD_NOT_FOUND') {
      return NextResponse.json({ error: 'Ask ARIS thread를 찾을 수 없습니다.' }, { status: 404 });
    }
    const message = error instanceof Error ? error.message : 'Ask ARIS 답변 생성에 실패했습니다.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
