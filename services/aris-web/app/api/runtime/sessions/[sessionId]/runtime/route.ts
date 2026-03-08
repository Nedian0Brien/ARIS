import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { getSessionRuntimeState } from '@/lib/happy/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId } = await params;
  const chatIdRaw = request.nextUrl.searchParams.get('chatId');
  const chatId = typeof chatIdRaw === 'string' && chatIdRaw.trim().length > 0
    ? chatIdRaw.trim()
    : undefined;
  try {
    const state = await getSessionRuntimeState(sessionId, { chatId });
    return NextResponse.json(state);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch runtime state';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
