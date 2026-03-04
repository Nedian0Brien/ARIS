import bcrypt from 'bcryptjs';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { prisma } from '@/lib/db/prisma';
import { createSessionCookieValue, isDeviceTrusted } from '@/lib/auth/session';
import { AUTH_COOKIE, DEVICE_COOKIE } from '@/lib/auth/constants';
import { env } from '@/lib/config';
import { writeAuditLog } from '@/lib/audit/log';
import { sendVerificationEmail } from '@/lib/email/sender';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const parsed = loginSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    await writeAuditLog({
      action: 'auth.login_failed',
      resourceType: 'user',
      payload: { email, reason: 'user_not_found' },
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  const ok = await bcrypt.compare(password, user.passwordHash);
  if (!ok) {
    await writeAuditLog({
      userId: user.id,
      action: 'auth.login_failed',
      resourceType: 'user',
      resourceId: user.id,
      payload: { email, reason: 'password_mismatch' },
      ip: request.headers.get('x-forwarded-for'),
      userAgent: request.headers.get('user-agent'),
    });
    return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
  }

  // Device Trust Check
  let deviceId = request.cookies.get(DEVICE_COOKIE)?.value;
  if (!deviceId) {
    deviceId = randomUUID();
  }

  const trusted = await isDeviceTrusted(user.id, deviceId);
  
  // 2FA TOTP Check
  if (user.twoFactorSecret && !trusted) {
    return NextResponse.json({ 
      status: '2fa_required', 
      method: 'totp',
      userId: user.id,
      deviceId
    });
  }

  // 2FA Email Check
  if (user.twoFactorEmailEnabled && !trusted) {
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    await prisma.emailVerificationToken.create({
      data: {
        userId: user.id,
        code,
        expiresAt,
      },
    });

    await sendVerificationEmail(user.email, code);

    return NextResponse.json({ 
      status: '2fa_required', 
      method: 'email',
      userId: user.id,
      deviceId
    });
  }

  // If trusted or no 2FA setup, proceed
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

  // Always refresh/set device cookie
  response.cookies.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
  });

  await writeAuditLog({
    userId: user.id,
    action: 'auth.login_success',
    resourceType: 'user',
    resourceId: user.id,
    payload: { email, trusted },
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  return response;
}
