import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSessions, createSession } from '@/lib/happy/client';

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const sessions = await listSessions();
    return NextResponse.json({ sessions });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load sessions';
    return NextResponse.json({ error: message }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  try {
    const body = await request.json();
    const { path, agent } = body;

    if (!path || !agent) {
      return NextResponse.json({ error: 'Path and agent are required' }, { status: 400 });
    }

    const session = await createSession({ path, agent });
    return NextResponse.json({ session });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create session';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
