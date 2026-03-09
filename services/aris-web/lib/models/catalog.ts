import type { AgentFlavor } from '@/lib/happy/types';
import { env } from '@/lib/config';

export type ProviderModel = {
  id: string;
  shortLabel: string;
  badge?: string;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

type ProviderKey = 'openai' | 'anthropic' | 'gemini';

const catalogCache: Partial<Record<ProviderKey, { expiresAt: number; data: ProviderModel[] }>> = {};

async function fetchJson<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, init);
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`Failed to load models (${response.status}): ${body || response.statusText}`);
  }
  return response.json() as Promise<T>;
}

function cacheResult(provider: ProviderKey, data: ProviderModel[]): ProviderModel[] {
  catalogCache[provider] = {
    expiresAt: Date.now() + CACHE_TTL_MS,
    data,
  };
  return data;
}

function getCachedModels(provider: ProviderKey): ProviderModel[] | null {
  const cached = catalogCache[provider];
  if (!cached) {
    return null;
  }
  if (cached.expiresAt < Date.now()) {
    delete catalogCache[provider];
    return null;
  }
  return cached.data;
}

function formatModels(list: ProviderModel[]): ProviderModel[] {
  return list
    .filter((item, index, arr) => item.id && arr.findIndex((candidate) => candidate.id === item.id) === index)
    .sort((a, b) => a.id.localeCompare(b.id));
}

async function fetchOpenAIModels(): Promise<ProviderModel[]> {
  if (!env.OPENAI_API_KEY) {
    return [];
  }
  const cached = getCachedModels('openai');
  if (cached) {
    return cached;
  }
  type OpenAIResponse = { data?: Array<{ id?: string; owned_by?: string }> };
  const payload = await fetchJson<OpenAIResponse>('https://api.openai.com/v1/models', {
    headers: {
      Authorization: `Bearer ${env.OPENAI_API_KEY}`,
    },
  });
  const items = formatModels(
    (payload.data ?? [])
      .filter((item) => typeof item.id === 'string')
      .filter((item) => /gpt|o\d|text-davinci|codex/i.test(item.id ?? ''))
      .map((item) => ({
        id: item.id!,
        shortLabel: item.id!,
        badge: item.owned_by?.includes('openai-internal') ? 'internal' : undefined,
      })),
  );
  return cacheResult('openai', items);
}

async function fetchAnthropicModels(): Promise<ProviderModel[]> {
  if (!env.ANTHROPIC_API_KEY) {
    return [];
  }
  const cached = getCachedModels('anthropic');
  if (cached) {
    return cached;
  }
  type AnthropicResponse = { data?: Array<{ id?: string }> };
  const payload = await fetchJson<AnthropicResponse>('https://api.anthropic.com/v1/models', {
    headers: {
      'x-api-key': env.ANTHROPIC_API_KEY,
      'anthropic-version': env.ANTHROPIC_API_VERSION,
    },
  });
  const items = formatModels(
    (payload.data ?? [])
      .filter((item) => typeof item.id === 'string')
      .map((item) => ({
        id: item.id!,
        shortLabel: item.id!,
        badge: item.id?.includes('opus') ? '고성능' : item.id?.includes('haiku') ? '빠름' : undefined,
      })),
  );
  return cacheResult('anthropic', items);
}

async function fetchGeminiModels(): Promise<ProviderModel[]> {
  if (!env.GEMINI_API_KEY) {
    return [];
  }
  const cached = getCachedModels('gemini');
  if (cached) {
    return cached;
  }
  type GeminiResponse = { models?: Array<{ name?: string; displayName?: string; supportedGenerationMethods?: string[] }> };
  const payload = await fetchJson<GeminiResponse>(`https://generativelanguage.googleapis.com/v1beta/models?key=${env.GEMINI_API_KEY}`);
  const items = formatModels(
    (payload.models ?? [])
      .filter((item) => typeof item.name === 'string')
      .filter((item) => (item.supportedGenerationMethods ?? []).includes('generateContent'))
      .map((item) => ({
        id: item.name!.split('/').pop() ?? item.name!,
        shortLabel: item.displayName ?? (item.name!.split('/').pop() ?? item.name!),
        badge: item.displayName?.includes('Flash') ? '빠름' : undefined,
      })),
  );
  return cacheResult('gemini', items);
}

export async function fetchModelsForAgent(agent: AgentFlavor): Promise<ProviderModel[]> {
  const normalized: AgentFlavor = agent === 'claude' || agent === 'codex' || agent === 'gemini' ? agent : 'codex';
  try {
    if (normalized === 'codex') {
      return await fetchOpenAIModels();
    }
    if (normalized === 'claude') {
      return await fetchAnthropicModels();
    }
    if (normalized === 'gemini') {
      return await fetchGeminiModels();
    }
    return [];
  } catch (error) {
    console.warn('Failed to fetch model catalog', error);
    return [];
  }
}
