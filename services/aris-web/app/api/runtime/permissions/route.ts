import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireApiUser, requireOperatorApiUser } from '@/lib/auth/guard';
import { writeAuditLog } from '@/lib/audit/log';
import { decidePermissionRequest, listPermissionRequests } from '@/lib/happy/client';

const decisionSchema = z.object({
  permissionId: z.string().min(1),
  decision: z.enum(['allow_once', 'allow_session', 'deny']),
});

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const sessionId = request.nextUrl.searchParams.get('sessionId') ?? undefined;
  const permissions = await listPermissionRequests(sessionId);
  return NextResponse.json({ permissions });
}

export async function POST(request: NextRequest) {
  const auth = await requireOperatorApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const parsed = decisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const result = await decidePermissionRequest(parsed.data);
  await writeAuditLog({
    userId: auth.user.id,
    action: 'runtime.permission_decision',
    resourceType: 'permission',
    resourceId: parsed.data.permissionId,
    payload: parsed.data,
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  return NextResponse.json({ result });
}
