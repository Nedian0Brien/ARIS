import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { AUTH_COOKIE } from '@/lib/auth/constants';
import { revokeTokenIfPresent } from '@/lib/auth/session';

export async function POST() {
  const cookieStore = await cookies();
  const token = cookieStore.get(AUTH_COOKIE)?.value;
  
  await revokeTokenIfPresent(token);

  const response = NextResponse.redirect(new URL('/login', process.env.APP_BASE_URL || 'http://localhost:3000'));
  response.cookies.delete(AUTH_COOKIE);
  
  return response;
}
