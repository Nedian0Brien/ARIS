import { createHash } from 'node:crypto';
import { decryptScopedSetting } from '@/lib/crypto/settings';
import {
  deriveOpenAiModelFamily,
  deriveOpenAiModelLabel,
  deriveOpenAiModelTags,
  isOpenAiTextGenerationModelId,
  type OpenAiCatalogItem,
} from '@/lib/settings/providerModels';

const OPENAI_KEY_SALT = 'aris-openai-settings-v1';
const OPENAI_CATALOG_CACHE_TTL_MS = 5 * 60 * 1000;

type OpenAiModelApiItem = {
  id?: unknown;
  created?: unknown;
};

type OpenAiCatalogCacheEntry = {
  expiresAt: number;
  items: OpenAiCatalogItem[];
};

const openAiCatalogCache = new Map<string, OpenAiCatalogCacheEntry>();

export class OpenAiCatalogError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'OpenAiCatalogError';
    this.status = status;
  }
}

export function buildOpenAiCatalogItems(payload: unknown): OpenAiCatalogItem[] {
  const rawItems = Array.isArray((payload as { data?: unknown[] } | null | undefined)?.data)
    ? (payload as { data: OpenAiModelApiItem[] }).data
    : [];

  return rawItems
    .map((item) => {
      const id = typeof item.id === 'string' ? item.id.trim() : '';
      const created = typeof item.created === 'number' && Number.isFinite(item.created) ? item.created : 0;
      if (!isOpenAiTextGenerationModelId(id)) {
        return null;
      }
      return {
        id,
        family: deriveOpenAiModelFamily(id),
        label: deriveOpenAiModelLabel(id),
        created,
        createdAt: created > 0 ? new Date(created * 1000).toISOString() : null,
        tags: deriveOpenAiModelTags(id),
      } satisfies OpenAiCatalogItem;
    })
    .filter((item): item is OpenAiCatalogItem => Boolean(item))
    .sort((left, right) => {
      if (right.created !== left.created) {
        return right.created - left.created;
      }
      return left.id.localeCompare(right.id);
    });
}

async function fetchOpenAiCatalogItems(apiKey: string): Promise<OpenAiCatalogItem[]> {
  const response = await fetch('https://api.openai.com/v1/models', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const message = typeof body?.error?.message === 'string'
      ? body.error.message
      : 'OpenAI 모델 목록을 불러오지 못했습니다.';
    throw new OpenAiCatalogError(message, response.status);
  }

  const payload = await response.json().catch(() => ({ data: [] }));
  return buildOpenAiCatalogItems(payload);
}

function buildCacheKey(encryptedApiKey: string): string {
  return createHash('sha256').update(encryptedApiKey).digest('hex');
}

export async function loadOpenAiCatalogItems(encryptedApiKey: string): Promise<OpenAiCatalogItem[]> {
  const cacheKey = buildCacheKey(encryptedApiKey);
  const cached = openAiCatalogCache.get(cacheKey);
  const now = Date.now();
  if (cached && cached.expiresAt > now) {
    return cached.items;
  }

  const apiKey = decryptScopedSetting(encryptedApiKey, OPENAI_KEY_SALT);
  const items = await fetchOpenAiCatalogItems(apiKey);
  openAiCatalogCache.set(cacheKey, {
    expiresAt: now + OPENAI_CATALOG_CACHE_TTL_MS,
    items,
  });
  return items;
}
