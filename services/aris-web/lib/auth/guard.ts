import { NextRequest, NextResponse } from 'next/server';
import { redirect } from 'next/navigation';
import type { AuthenticatedUser } from '@/lib/auth/types';
import { getAuthenticatedUserFromToken, getCurrentUserFromCookies } from '@/lib/auth/session';
import { AUTH_COOKIE } from '@/lib/auth/constants';

export async function requireApiUser(request: NextRequest): Promise<{ user: AuthenticatedUser } | { response: NextResponse }> {
  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  const user = await getAuthenticatedUserFromToken(token);
  if (!user) {
    return { response: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) };
  }

  return { user };
}

export async function requireOperatorApiUser(request: NextRequest): Promise<{ user: AuthenticatedUser } | { response: NextResponse }> {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth;
  }

  if (auth.user.role !== 'operator') {
    return { response: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) };
  }

  return auth;
}

export async function requirePageUser(): Promise<AuthenticatedUser> {
  const user = await getCurrentUserFromCookies();
  if (!user) {
    redirect('/login');
  }

  return user;
}
