import { NextRequest, NextResponse } from 'next/server';
import { AUTH_COOKIE } from '@/lib/auth/constants';

const PUBLIC_PATHS = ['/login'];
const IS_DEV = process.env.NODE_ENV !== 'production';
const RUNTIME_RATE_LIMIT_WINDOW_MS = 10_000;
const RUNTIME_RATE_LIMIT_MAX_REQUESTS = 120;
const RUNTIME_RATE_LIMIT_BUCKET_TTL_MULTIPLIER = 6;

type RequestBucket = {
  windowStartAt: number;
  count: number;
  lastSeenAt: number;
};

const runtimeRateLimitBuckets = new Map<string, RequestBucket>();

function resolveRequestIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded && forwarded.trim().length > 0) {
    return forwarded.split(',')[0].trim();
  }

  const realIp = request.headers.get('x-real-ip');
  if (realIp && realIp.trim().length > 0) {
    return realIp.trim();
  }

  return 'unknown';
}

function isRuntimeApiPath(pathname: string): boolean {
  return pathname.startsWith('/api/runtime/');
}

function isRuntimeRateLimitExceeded(path: string, ip: string): boolean {
  const now = Date.now();
  if (runtimeRateLimitBuckets.size > 2_000) {
    const staleBefore = now - RUNTIME_RATE_LIMIT_WINDOW_MS * RUNTIME_RATE_LIMIT_BUCKET_TTL_MULTIPLIER;
    for (const [key, bucket] of runtimeRateLimitBuckets.entries()) {
      if (bucket.lastSeenAt < staleBefore) {
        runtimeRateLimitBuckets.delete(key);
      }
    }
  }

  const key = `${ip}:${path}`;
  const bucket = runtimeRateLimitBuckets.get(key);
  if (!bucket) {
    runtimeRateLimitBuckets.set(key, {
      windowStartAt: now,
      count: 1,
      lastSeenAt: now,
    });
    return false;
  }

  if (now - bucket.windowStartAt >= RUNTIME_RATE_LIMIT_WINDOW_MS) {
    bucket.windowStartAt = now;
    bucket.count = 1;
    bucket.lastSeenAt = now;
    return false;
  }

  bucket.count += 1;
  bucket.lastSeenAt = now;
  return bucket.count > RUNTIME_RATE_LIMIT_MAX_REQUESTS;
}

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

  if (isRuntimeApiPath(pathname) && isRuntimeRateLimitExceeded(pathname, resolveRequestIp(request))) {
    return NextResponse.json(
      { error: '요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(RUNTIME_RATE_LIMIT_WINDOW_MS / 1000)) } },
    );
  }

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
