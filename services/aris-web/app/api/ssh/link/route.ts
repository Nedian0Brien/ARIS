import { randomUUID } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireOperatorApiUser } from '@/lib/auth/guard';
import { env } from '@/lib/config';
import { writeAuditLog } from '@/lib/audit/log';

const bodySchema = z.object({
  sessionId: z.string().min(1),
  reason: z.string().min(1),
  accessOption: z.enum(['guided_link', 'direct_terminal']).default('guided_link'),
});

async function parseInput(
  request: NextRequest,
): Promise<{ sessionId: string; reason: string; accessOption: 'guided_link' | 'direct_terminal' } | null> {
  const contentType = request.headers.get('content-type') ?? '';

  if (contentType.includes('application/json')) {
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    return parsed.success ? parsed.data : null;
  }

  const formData = await request.formData().catch(() => null);
  if (!formData) {
    return null;
  }

  const parsed = bodySchema.safeParse({
    sessionId: formData.get('sessionId'),
    reason: formData.get('reason'),
    accessOption: formData.get('accessOption'),
  });
  return parsed.success ? parsed.data : null;
}

export async function POST(request: NextRequest) {
  const auth = await requireOperatorApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const input = await parseInput(request);
  if (!input) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const expiresAt = new Date(Date.now() + env.SSH_LINK_TTL_SECONDS * 1000);
  const nonce = randomUUID().slice(0, 8);
  const commandPrefix = input.accessOption === 'direct_terminal' ? env.SSH_BASE_COMMAND : `${env.SSH_BASE_COMMAND} -o StrictHostKeyChecking=yes`;
  const command = `${commandPrefix} # aris-session=${input.sessionId} nonce=${nonce}`;

  await writeAuditLog({
    userId: auth.user.id,
    action: 'ssh.link_issued',
    resourceType: 'session',
    resourceId: input.sessionId,
    payload: {
      reason: input.reason,
      accessOption: input.accessOption,
      command,
      expiresAt: expiresAt.toISOString(),
    },
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  const contentType = request.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    return NextResponse.json({ command, expiresAt: expiresAt.toISOString(), accessOption: input.accessOption });
  }

  const referer = request.headers.get('referer');
  const redirectUrl = referer ? new URL(referer) : new URL('/', request.nextUrl.origin);
  redirectUrl.searchParams.set('ssh_command', command);
  redirectUrl.searchParams.set('ssh_expires_at', expiresAt.toISOString());
  return NextResponse.redirect(redirectUrl);
}
