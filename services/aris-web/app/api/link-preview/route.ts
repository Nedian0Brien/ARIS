import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/* ─── Types ─── */

type SiteType = 'github_repo' | 'github_issue' | 'github_pr' | 'youtube' | 'generic';

interface OgMeta {
  url: string;
  title: string;
  description: string;
  image: string;
  siteName: string;
  favicon: string;
  siteType: SiteType;
  extra: Record<string, string>;
}

/* ─── File-based persistent cache ─── */

const CACHE_DIR = path.join(process.cwd(), '.cache', 'link-preview');
const CACHE_TTL_MS = 1000 * 60 * 60 * 24; // 24 hours
const MAX_MEMORY_CACHE = 200;
const FETCH_TIMEOUT_MS = 5000;

const memoryCache = new Map<string, { data: OgMeta; ts: number }>();

function cacheKey(url: string): string {
  return crypto.createHash('sha256').update(url).digest('hex').slice(0, 24);
}

function ensureCacheDir(): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
  } catch {
    // ignore
  }
}

function readDiskCache(url: string): OgMeta | null {
  try {
    const filePath = path.join(CACHE_DIR, `${cacheKey(url)}.json`);
    const stat = fs.statSync(filePath);
    if (Date.now() - stat.mtimeMs > CACHE_TTL_MS) {
      fs.unlinkSync(filePath);
      return null;
    }
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as OgMeta;
  } catch {
    return null;
  }
}

function writeDiskCache(url: string, data: OgMeta): void {
  try {
    ensureCacheDir();
    const filePath = path.join(CACHE_DIR, `${cacheKey(url)}.json`);
    fs.writeFileSync(filePath, JSON.stringify(data), 'utf-8');
  } catch {
    // ignore write errors
  }
}

function getCached(url: string): OgMeta | null {
  const mem = memoryCache.get(url);
  if (mem && Date.now() - mem.ts < CACHE_TTL_MS) return mem.data;
  if (mem) memoryCache.delete(url);

  const disk = readDiskCache(url);
  if (disk) {
    if (memoryCache.size >= MAX_MEMORY_CACHE) {
      const oldest = memoryCache.keys().next().value;
      if (oldest !== undefined) memoryCache.delete(oldest);
    }
    memoryCache.set(url, { data: disk, ts: Date.now() });
    return disk;
  }
  return null;
}

function setCache(url: string, data: OgMeta): void {
  if (memoryCache.size >= MAX_MEMORY_CACHE) {
    const oldest = memoryCache.keys().next().value;
    if (oldest !== undefined) memoryCache.delete(oldest);
  }
  memoryCache.set(url, { data, ts: Date.now() });
  writeDiskCache(url, data);
}

/* ─── Site type detection ─── */

function detectSiteType(url: string): SiteType {
  try {
    const u = new URL(url);
    const host = u.hostname.replace(/^www\./, '');

    if (host === 'github.com') {
      const parts = u.pathname.split('/').filter(Boolean);
      if (parts.length >= 2 && parts[2] === 'pull') return 'github_pr';
      if (parts.length >= 2 && parts[2] === 'issues') return 'github_issue';
      if (parts.length === 2) return 'github_repo';
      return 'github_repo';
    }

    if (
      host === 'youtube.com' ||
      host === 'm.youtube.com' ||
      host === 'youtu.be'
    ) {
      return 'youtube';
    }
  } catch {
    // ignore
  }
  return 'generic';
}

/* ─── Special site enrichment ─── */

function extractYouTubeVideoId(url: string): string {
  try {
    const u = new URL(url);
    if (u.hostname === 'youtu.be') return u.pathname.slice(1);
    return u.searchParams.get('v') ?? '';
  } catch {
    return '';
  }
}

function enrichYouTube(meta: OgMeta): OgMeta {
  const videoId = extractYouTubeVideoId(meta.url);
  if (!videoId) return meta;
  return {
    ...meta,
    image: meta.image || `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`,
    extra: {
      ...meta.extra,
      videoId,
      embedUrl: `https://www.youtube.com/embed/${videoId}`,
    },
  };
}

function enrichGitHub(meta: OgMeta, siteType: SiteType): OgMeta {
  try {
    const u = new URL(meta.url);
    const parts = u.pathname.split('/').filter(Boolean);
    const extra: Record<string, string> = { ...meta.extra };

    if (parts.length >= 2) {
      extra.owner = parts[0];
      extra.repo = parts[1];
    }
    if (siteType === 'github_issue' && parts.length >= 4) {
      extra.issueNumber = parts[3];
    }
    if (siteType === 'github_pr' && parts.length >= 4) {
      extra.prNumber = parts[3];
    }

    return {
      ...meta,
      favicon: meta.favicon || 'https://github.githubassets.com/favicons/favicon.svg',
      extra,
    };
  } catch {
    return meta;
  }
}

/* ─── HTML parsing helpers ─── */

function extractMetaContent(html: string, property: string): string {
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
    if (m?.[1]) return resolveUrl(m[1], baseUrl);
  }
  try {
    return `${new URL(baseUrl).origin}/favicon.ico`;
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

function tryHostname(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/* ─── Fetch & parse ─── */

async function fetchOgMeta(url: string): Promise<OgMeta> {
  const siteType = detectSiteType(url);
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
      let fallback: OgMeta = { url, title: '', description: '', image: '', siteName: tryHostname(url), favicon: '', siteType, extra: {} };
      if (siteType === 'youtube') {
        fallback = enrichYouTube(fallback);
      } else if (siteType.startsWith('github')) {
        fallback = enrichGitHub(fallback, siteType);
      }
      return fallback;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      return { url, title: '', description: '', image: '', siteName: '', favicon: '', siteType, extra: {} };
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

    let meta: OgMeta = {
      url,
      title: ogTitle || twitterTitle || extractTitle(html),
      description: ogDesc || twitterDesc || metaDesc,
      image: resolveUrl(ogImage || twitterImage, url),
      siteName: ogSiteName || tryHostname(url),
      favicon: extractFavicon(html, url),
      siteType,
      extra: {},
    };

    // Enrich based on site type
    if (siteType === 'youtube') {
      meta = enrichYouTube(meta);
    } else if (siteType.startsWith('github_') || siteType === 'github_repo') {
      meta = enrichGitHub(meta, siteType);
    }

    return meta;
  } catch {
    clearTimeout(timer);
    let fallback: OgMeta = { url, title: '', description: '', image: '', siteName: tryHostname(url), favicon: '', siteType, extra: {} };
    if (siteType === 'youtube') {
      fallback = enrichYouTube(fallback);
    } else if (siteType.startsWith('github')) {
      fallback = enrichGitHub(fallback, siteType);
    }
    return fallback;
  }
}

/* ─── Route handler ─── */

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
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 });
  }

  const cached = getCached(targetUrl);
  if (cached) {
    return NextResponse.json(cached, {
      headers: { 'Cache-Control': 'public, max-age=1800' },
    });
  }

  const meta = await fetchOgMeta(targetUrl);
  setCache(targetUrl, meta);

  return NextResponse.json(meta, {
    headers: { 'Cache-Control': 'public, max-age=1800' },
  });
}
