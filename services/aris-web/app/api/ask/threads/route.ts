import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { createAskThread } from '@/lib/ask/knowledge';

export async function POST(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const body = (await request.json().catch(() => ({}))) as { title?: string };
  const thread = await createAskThread({
    userId: auth.user.id,
    title: body.title,
  });

  return NextResponse.json({ thread });
}
