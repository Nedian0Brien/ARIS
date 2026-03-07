import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth/constants';

const PUBLIC_PATHS = ['/login'];
const IS_DEV = process.env.NODE_ENV !== 'production';

function buildCsp(): string {
  if (IS_DEV) {
    // Next.js dev/HMR needs eval and websocket connections.
    return "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' ws: wss: http: https:; frame-ancestors 'none';";
  }

  return "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none';";
}

function withSecurityHeaders(response: NextResponse): NextResponse {
  response.headers.set('X-Frame-Options', 'DENY');
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
  response.headers.set('Content-Security-Policy', buildCsp());
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (pathname.startsWith('/_next') || pathname.startsWith('/favicon.ico') || pathname.startsWith('/api/auth/')) {
    return withSecurityHeaders(NextResponse.next());
  }

  if (PUBLIC_PATHS.includes(pathname)) {
    return withSecurityHeaders(NextResponse.next());
  }

  const token = request.cookies.get(AUTH_COOKIE)?.value;
  if (!token && !pathname.startsWith('/api/')) {
    const redirectUrl = new URL('/login', request.url);
    redirectUrl.searchParams.set('next', `${pathname}${search}`);
    return withSecurityHeaders(NextResponse.redirect(redirectUrl));
  }

  return withSecurityHeaders(NextResponse.next());
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
