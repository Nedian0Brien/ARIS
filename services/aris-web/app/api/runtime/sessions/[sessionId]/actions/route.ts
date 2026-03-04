import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { runSessionAction } from '@/lib/happy/client';

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
    const result = await runSessionAction(sessionId, body.action);
    return NextResponse.json({ result });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to run session action' }, { status: 500 });
  }
}
