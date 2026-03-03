import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { writeAuditLog } from '@/lib/audit/log';
import { requireApiUser } from '@/lib/auth/guard';
import { appendSessionMessage, getSessionEvents } from '@/lib/happy/client';

const appendEventSchema = z.object({
  type: z.enum(['message', 'tool', 'read', 'write']).default('message'),
  title: z.string().min(1).max(120).optional(),
  text: z.string().min(1).max(12000),
  meta: z.record(z.string(), z.unknown()).optional(),
});

export async function GET(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const { sessionId } = await params;
  const result = await getSessionEvents(sessionId);
  return NextResponse.json(result);
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ sessionId: string }> }) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const parsed = appendEventSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { sessionId } = await params;
  const event = await appendSessionMessage({
    sessionId,
    type: parsed.data.type,
    title: parsed.data.title,
    text: parsed.data.text,
    meta: {
      ...(parsed.data.meta ?? {}),
      actorUserId: auth.user.id,
      actorEmail: auth.user.email,
    },
  });

  await writeAuditLog({
    userId: auth.user.id,
    action: 'runtime.session_message_create',
    resourceType: 'session',
    resourceId: sessionId,
    payload: {
      type: parsed.data.type,
      title: parsed.data.title ?? null,
      textLength: parsed.data.text.length,
      hasMeta: Boolean(parsed.data.meta),
    },
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  return NextResponse.json({ event }, { status: 201 });
}
