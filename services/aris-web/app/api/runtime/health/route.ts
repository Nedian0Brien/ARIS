import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { getRuntimeHealth } from '@/lib/happy/client';

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const health = await getRuntimeHealth();
  return NextResponse.json(health);
}
