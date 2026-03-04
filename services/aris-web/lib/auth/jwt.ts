import { SignJWT, jwtVerify } from 'jose';
import { env } from '@/lib/config';
import type { SessionJwtPayload } from '@/lib/auth/types';

const secret = new TextEncoder().encode(env.AUTH_JWT_SECRET);

export async function signSessionJwt(
  payload: SessionJwtPayload,
  ttlSeconds: number = env.AUTH_TOKEN_TTL_SECONDS,
): Promise<string> {
  return new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.sub)
    .setJti(payload.jti)
    .setIssuedAt()
    .setExpirationTime(`${ttlSeconds}s`)
    .sign(secret);
}

export async function verifySessionJwt(token: string): Promise<SessionJwtPayload> {
  const verified = await jwtVerify<SessionJwtPayload>(token, secret, {
    algorithms: ['HS256'],
  });

  return verified.payload;
}
