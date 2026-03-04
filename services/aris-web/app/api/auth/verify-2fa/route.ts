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
  method: z.enum(['totp', 'email']).default('totp'),
  rememberMe: z.boolean().default(false),
});

export async function POST(request: NextRequest) {
  const parsed = verifySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { userId, code, deviceId, method, rememberMe } = parsed.data;
  const user = await prisma.user.findUnique({ where: { id: userId } });

  if (!user) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  let isValid = false;

  if (method === 'totp') {
    if (!user.twoFactorSecret) {
      return NextResponse.json({ error: 'TOTP 2FA not enabled' }, { status: 400 });
    }
    isValid = authenticator.verify({
      token: code,
      secret: user.twoFactorSecret,
    });
  } else if (method === 'email') {
    if (!user.twoFactorEmailEnabled) {
      return NextResponse.json({ error: 'Email 2FA not enabled' }, { status: 400 });
    }
    
    const token = await prisma.emailVerificationToken.findFirst({
      where: {
        userId: user.id,
        code,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (token) {
      isValid = true;
      // Delete used token (and older ones)
      await prisma.emailVerificationToken.deleteMany({
        where: { userId: user.id },
      });
    }
  }

  if (!isValid) {
    await writeAuditLog({
      userId: user.id,
      action: `auth.2fa_failed_${method}`,
      resourceType: 'user',
      resourceId: user.id,
      payload: { deviceId, reason: 'invalid_code' },
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Invalid or expired verification code' }, { status: 401 });
  }

  const sessionTtlSeconds = rememberMe ? env.AUTH_TOKEN_REMEMBER_TTL_SECONDS : env.AUTH_TOKEN_TTL_SECONDS;

  // Success: optionally trust device and create session
  if (rememberMe) {
    await trustDevice(user.id, deviceId);
  }
  const token = await createSessionCookieValue(
    { id: user.id, email: user.email, role: user.role },
    sessionTtlSeconds,
  );

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
    ...(rememberMe ? { maxAge: sessionTtlSeconds } : {}),
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
    action: `auth.2fa_success_${method}`,
    resourceType: 'user',
    resourceId: user.id,
    payload: { email: user.email, deviceId },
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  return response;
}
