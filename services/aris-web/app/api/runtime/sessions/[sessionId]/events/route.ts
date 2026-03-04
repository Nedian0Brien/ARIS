import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { getSessionEvents, appendSessionMessage } from '@/lib/happy/client';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> }
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId } = await params;
  try {
    const { events } = await getSessionEvents(sessionId);
    return NextResponse.json({ events });
  } catch (error) {
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
    const message = error instanceof Error ? error.message : 'Failed to send message';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
