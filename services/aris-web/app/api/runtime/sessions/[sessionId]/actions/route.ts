import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOperatorApiUser } from '@/lib/auth/guard';
import { writeAuditLog } from '@/lib/audit/log';
import { runSessionAction } from '@/lib/happy/client';

const actionSchema = z.object({
  action: z.enum(['abort', 'retry', 'kill', 'resume']),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireOperatorApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { sessionId } = await params;
  const result = await runSessionAction(sessionId, parsed.data.action);

  await writeAuditLog({
    userId: auth.user.id,
    action: 'runtime.session_action',
    resourceType: 'session',
    resourceId: sessionId,
    payload: parsed.data,
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  return NextResponse.json({ result });
}
