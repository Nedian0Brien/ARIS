import { randomUUID } from 'node:crypto';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/db/prisma';
import { env } from '@/lib/config';
import { signSessionJwt, verifySessionJwt } from '@/lib/auth/jwt';
import type { AuthenticatedUser } from '@/lib/auth/types';
import { AUTH_COOKIE } from '@/lib/auth/constants';

export async function createSessionCookieValue(user: AuthenticatedUser): Promise<string> {
  const jti = randomUUID();
  const expiresAt = new Date(Date.now() + env.AUTH_TOKEN_TTL_SECONDS * 1000);

  await prisma.authSession.create({
    data: {
      userId: user.id,
      jti,
      expiresAt,
    },
  });

  return signSessionJwt({
    sub: user.id,
    email: user.email,
    role: user.role,
    jti,
  });
}

export async function getAuthenticatedUserFromToken(token: string): Promise<AuthenticatedUser | null> {
  try {
    const payload = await verifySessionJwt(token);

    const session = await prisma.authSession.findUnique({ where: { jti: payload.jti } });
    if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) {
      return null;
    }

    const user = await prisma.user.findUnique({ where: { id: payload.sub } });
    if (!user) {
      return null;
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
    };
  } catch {
    return null;
  }
}

export async function getCurrentUserFromCookies(): Promise<AuthenticatedUser | null> {
  const store = await cookies();
  const token = store.get(AUTH_COOKIE)?.value;
  if (!token) {
    return null;
  }

  return getAuthenticatedUserFromToken(token);
}

export async function revokeTokenIfPresent(token: string | undefined): Promise<void> {
  if (!token) {
    return;
  }

  try {
    const payload = await verifySessionJwt(token);
    await prisma.authSession.updateMany({
      where: { jti: payload.jti, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } catch {
    // Ignore malformed or expired token during logout.
  }
}
