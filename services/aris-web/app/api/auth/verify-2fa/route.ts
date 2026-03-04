import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authenticator } from 'otplib';
import { prisma } from '@/lib/db/prisma';
import { createSessionCookieValue, trustDevice } from '@/lib/auth/session';
import { AUTH_COOKIE, DEVICE_COOKIE } from '@/lib/auth/constants';
import { env } from '@/lib/config';
import { writeAuditLog } from '@/lib/audit/log';

const verifySchema = z.object({
  userId: z.string().min(1),
  code: z.string().length(6),
  deviceId: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = verifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { userId, code, deviceId } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user || !user.twoFactorSecret) {
    return NextResponse.json({ error: 'User not found or 2FA not enabled' }, { status: 400 });
  }

  const isValid = authenticator.verify({
    token: code,
    secret: user.twoFactorSecret,
  });

  if (!isValid) {
    await writeAuditLog({
      userId: user.id,
      action: 'auth.2fa_failed',
      resourceType: 'user',
      resourceId: user.id,
      payload: { deviceId, reason: 'invalid_code' },
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Invalid verification code' }, { status: 401 });
  }

  // Success: Trust device and create session
  await trustDevice(user.id, deviceId);
  const token = await createSessionCookieValue({ id: user.id, email: user.email, role: user.role });

  const response = NextResponse.json({
    status: 'success',
    user: {
      id: user.id,
      email: user.email,
      role: user.role,
    },
  });

  response.cookies.set(AUTH_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: env.AUTH_TOKEN_TTL_SECONDS,
  });

  response.cookies.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365,
  });

  await writeAuditLog({
    userId: user.id,
    action: 'auth.2fa_success',
    resourceType: 'user',
    resourceId: user.id,
    payload: { email: user.email, deviceId },
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  return response;
}
