import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { getSessionEvents, appendSessionMessage, HappyHttpError } from '@/lib/happy/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId } = await params;
  const beforeRaw = request.nextUrl.searchParams.get('before');
  const afterRaw = request.nextUrl.searchParams.get('after');
  const limitRaw = request.nextUrl.searchParams.get('limit');
  const chatIdRaw = request.nextUrl.searchParams.get('chatId');
  const includeUnassignedRaw = request.nextUrl.searchParams.get('includeUnassigned');
  const before = typeof beforeRaw === 'string' && beforeRaw.trim().length > 0 ? beforeRaw.trim() : undefined;
  const after = typeof afterRaw === 'string' && afterRaw.trim().length > 0 ? afterRaw.trim() : undefined;
  const limit = typeof limitRaw === 'string' && limitRaw.trim().length > 0 ? Number(limitRaw) : undefined;
  const chatId = typeof chatIdRaw === 'string' && chatIdRaw.trim().length > 0 ? chatIdRaw.trim() : undefined;
  const includeUnassigned = includeUnassignedRaw === '1' || includeUnassignedRaw === 'true';

  if (before && after) {
    return NextResponse.json({ error: 'before와 after를 동시에 사용할 수 없습니다.' }, { status: 400 });
  }

  try {
    const { events, page } = await getSessionEvents(sessionId, {
      userId: auth.user.id,
      before,
      after,
      limit,
      chatId,
      includeUnassigned,
    });
    return NextResponse.json({ events, page });
  } catch (error) {
    if (error instanceof HappyHttpError && [401, 403, 404].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Failed to fetch events';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

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
    const event = await appendSessionMessage({
      sessionId,
      type: body.type || 'message',
      title: body.title,
      text: body.text,
      meta: body.meta,
    });
    return NextResponse.json({ event });
  } catch (error) {
    if (error instanceof HappyHttpError && [401, 403, 404].includes(error.status)) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Failed to send message';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
