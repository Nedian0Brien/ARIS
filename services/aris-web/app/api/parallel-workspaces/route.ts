import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { createParallelWorkspace } from '@/lib/parallelWorkspace/store';

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
    const rootPath = typeof body?.rootPath === 'string' ? body.rootPath : '';
    const title = typeof body?.title === 'string' ? body.title : null;
    const workspace = await createParallelWorkspace({
      userId: auth.user.id,
      rootPath,
      title,
    });
    return NextResponse.json({ workspace }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create parallel workspace';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
