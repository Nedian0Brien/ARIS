import { NextRequest, NextResponse } from 'next/server';
import { revokeTokenIfPresent } from '@/lib/auth/session';
import { AUTH_COOKIE } from '@/lib/auth/constants';
import { env } from '@/lib/config';
import { writeAuditLog } from '@/lib/audit/log';

export async function POST(request: NextRequest) {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  await revokeTokenIfPresent(token);

  const response = NextResponse.redirect(new URL('/login', request.url));
  response.cookies.set(AUTH_COOKIE, '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
  });

  await writeAuditLog({
    action: 'auth.logout',
    resourceType: 'session',
    ip: request.headers.get('x-forwarded-for'),
    userAgent: request.headers.get('user-agent'),
  });

  return response;
}
