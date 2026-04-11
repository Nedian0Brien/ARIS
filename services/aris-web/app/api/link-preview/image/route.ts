import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const FETCH_TIMEOUT_MS = 8000;
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
const ALLOWED_CONTENT_TYPES = [
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/svg+xml',
  'image/x-icon',
  'image/vnd.microsoft.icon',
];

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;

  const targetUrl = request.nextUrl.searchParams.get('url');
  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Invalid URL scheme' }, { status: 400 });
    }
    // Block private/loopback IPs for SSRF prevention
    const host = parsed.hostname;
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '::1' ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
      host.endsWith('.local')
    ) {
      return NextResponse.json({ error: 'Private addresses not allowed' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const upstream = await fetch(targetUrl, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ARISBot/1.0; +https://aris.lawdigest.cloud)',
        Accept: 'image/*',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!upstream.ok) {
      return NextResponse.json({ error: 'Upstream fetch failed' }, { status: 502 });
    }

    const contentType = upstream.headers.get('content-type')?.split(';')[0]?.trim() ?? '';
    if (!ALLOWED_CONTENT_TYPES.some((t) => contentType.startsWith(t))) {
      return NextResponse.json({ error: 'Not an image' }, { status: 400 });
    }

    const contentLength = parseInt(upstream.headers.get('content-length') ?? '0', 10);
    if (contentLength > MAX_IMAGE_BYTES) {
      return NextResponse.json({ error: 'Image too large' }, { status: 413 });
    }

    // Stream body with size limit
    const reader = upstream.body?.getReader();
    if (!reader) {
      return NextResponse.json({ error: 'No body' }, { status: 502 });
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      totalBytes += value.length;
      if (totalBytes > MAX_IMAGE_BYTES) {
        reader.cancel().catch(() => {});
        return NextResponse.json({ error: 'Image too large' }, { status: 413 });
      }
      chunks.push(value);
    }

    const body = Buffer.from(chunks.length === 1 ? chunks[0] : Buffer.concat(chunks));

    return new NextResponse(body as unknown as BodyInit, {
      status: 200,
      headers: {
        'Content-Type': contentType,
        'Content-Length': String(totalBytes),
        'Cache-Control': 'public, max-age=86400, immutable',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    clearTimeout(timer);
    return NextResponse.json({ error: 'Fetch failed' }, { status: 502 });
  }
}
