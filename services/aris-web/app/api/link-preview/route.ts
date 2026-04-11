import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

interface OgMeta {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
  favicon: string;
}

const metaCache = new Map<string, { data: OgMeta; ts: number }>();
const CACHE_TTL_MS = 1000 * 60 * 30; // 30 min
const MAX_CACHE_SIZE = 200;
const FETCH_TIMEOUT_MS = 5000;

function extractMetaContent(html: string, property: string): string {
  // Match both property="og:..." and name="og:..." patterns
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]+content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${property}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return m[1];
  }
  return '';
}

function extractTitle(html: string): string {
  const m = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  return m?.[1]?.trim() ?? '';
}

function extractFavicon(html: string, baseUrl: string): string {
  const patterns = [
    /<link[^>]+rel=["'](?:icon|shortcut icon)["'][^>]+href=["']([^"']*)["']/i,
    /<link[^>]+href=["']([^"']*)["'][^>]+rel=["'](?:icon|shortcut icon)["']/i,
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) {
      return resolveUrl(m[1], baseUrl);
    }
  }
  try {
    const u = new URL(baseUrl);
    return `${u.origin}/favicon.ico`;
  } catch {
    return '';
  }
}

function resolveUrl(raw: string, base: string): string {
  if (!raw) return '';
  try {
    return new URL(raw, base).href;
  } catch {
    return raw;
  }
}

async function fetchOgMeta(url: string): Promise<OgMeta> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ARISBot/1.0; +https://aris.lawdigest.cloud)',
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'follow',
    });
    clearTimeout(timer);

    if (!res.ok) {
      return { url, title: '', description: '', image: '', siteName: '', favicon: '' };
    }

    // Only read first 50KB for meta tags
    const reader = res.body?.getReader();
    if (!reader) {
      return { url, title: '', description: '', image: '', siteName: '', favicon: '' };
    }

    const chunks: Uint8Array[] = [];
    let totalBytes = 0;
    const MAX_BYTES = 50_000;

    while (totalBytes < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done || !value) break;
      chunks.push(value);
      totalBytes += value.length;
    }
    reader.cancel().catch(() => {});

    const html = new TextDecoder().decode(
      chunks.length === 1 ? chunks[0] : Buffer.concat(chunks),
    );

    const ogTitle = extractMetaContent(html, 'og:title');
    const ogDesc = extractMetaContent(html, 'og:description');
    const ogImage = extractMetaContent(html, 'og:image');
    const ogSiteName = extractMetaContent(html, 'og:site_name');
    const metaDesc = extractMetaContent(html, 'description');
    const twitterTitle = extractMetaContent(html, 'twitter:title');
    const twitterDesc = extractMetaContent(html, 'twitter:description');
    const twitterImage = extractMetaContent(html, 'twitter:image');

    return {
      url,
      title: ogTitle || twitterTitle || extractTitle(html),
      description: ogDesc || twitterDesc || metaDesc,
      image: resolveUrl(ogImage || twitterImage, url),
      siteName: ogSiteName || tryHostname(url),
      favicon: extractFavicon(html, url),
    };
  } catch {
    clearTimeout(timer);
    return { url, title: '', description: '', image: '', siteName: tryHostname(url), favicon: '' };
  }
}

function tryHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) return auth.response;

  const targetUrl = request.nextUrl.searchParams.get('url');
  if (!targetUrl) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  // Validate URL scheme
  try {
    const parsed = new URL(targetUrl);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return NextResponse.json({ error: 'Invalid URL scheme' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  // Check cache
  const cached = metaCache.get(targetUrl);
  if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
    return NextResponse.json(cached.data, {
      headers: { 'Cache-Control': 'public, max-age=1800' },
    });
  }

  const meta = await fetchOgMeta(targetUrl);

  // Evict oldest if full
  if (metaCache.size >= MAX_CACHE_SIZE) {
    const oldest = metaCache.keys().next().value;
    if (oldest !== undefined) metaCache.delete(oldest);
  }
  metaCache.set(targetUrl, { data: meta, ts: Date.now() });

  return NextResponse.json(meta, {
    headers: { 'Cache-Control': 'public, max-age=1800' },
  });
}
