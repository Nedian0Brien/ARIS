import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { env } from '@/lib/config';

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  if (auth.user.role !== 'operator') {
    return NextResponse.json({ error: 'Operator role required' }, { status: 403 });
  }

  const expiresAt = new Date(Date.now() + env.SSH_LINK_TTL_SECONDS * 1000).toISOString();
  
  return NextResponse.json({
    command: env.SSH_BASE_COMMAND,
    expiresAt,
  });
}
