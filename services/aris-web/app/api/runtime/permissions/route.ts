import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { decidePermissionRequest, listPermissionRequests } from '@/lib/happy/client';

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const sessionId = request.nextUrl.searchParams.get('sessionId') ?? undefined;
    const permissions = await listPermissionRequests(sessionId);
    return NextResponse.json({ permissions });
  } catch {
    return NextResponse.json({ error: 'Failed to fetch permissions' }, { status: 500 });
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
    const result = await decidePermissionRequest({
      permissionId: body.permissionId,
      decision: body.decision,
    });
    return NextResponse.json({ result });
  } catch {
    return NextResponse.json({ error: 'Failed to process permission' }, { status: 500 });
  }
}
