import type { ExternalSearchResult } from '@/lib/ask/knowledge';

function normalizeResult(input: unknown): ExternalSearchResult | null {
  if (!input || typeof input !== 'object') return null;
  const record = input as Record<string, unknown>;
  const title = typeof record.title === 'string' ? record.title.trim() : '';
  const snippet = typeof record.snippet === 'string'
    ? record.snippet.trim()
    : typeof record.text === 'string'
      ? record.text.trim()
      : '';
  if (!title || !snippet) return null;
  const url = typeof record.url === 'string' && record.url.trim() ? record.url.trim() : undefined;
  return {
    title: title.slice(0, 160),
    url,
    snippet: snippet.slice(0, 360),
    sourceType: 'external_search',
  };
}

export async function searchExternalSources(query: string): Promise<ExternalSearchResult[]> {
  const endpoint = process.env.ARIS_EXTERNAL_SEARCH_ENDPOINT?.trim();
  if (!endpoint || !query.trim()) {
    return [];
  }

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: query.trim(), limit: 4 }),
      cache: 'no-store',
    });
    if (!response.ok) return [];
    const payload = await response.json().catch(() => null) as { results?: unknown[] } | unknown[] | null;
    const rawResults = Array.isArray(payload) ? payload : Array.isArray(payload?.results) ? payload.results : [];
    return rawResults.map(normalizeResult).filter((result): result is ExternalSearchResult => Boolean(result)).slice(0, 4);
  } catch {
    return [];
  }
}
