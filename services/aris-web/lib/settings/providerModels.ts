export type ProviderId = 'codex' | 'claude' | 'gemini';

export type ProviderModelSelection = {
  selectedModelIds: string[];
};

export type ProviderModelSelections = Record<ProviderId, ProviderModelSelection>;

export type OpenAiCatalogItem = {
  id: string;
  family: string;
  label: string;
  created: number;
  createdAt: string | null;
  tags: string[];
};

export type ClaudeCatalogItem = {
  id: string;
  family: string;
  label: string;
  created: number;
  createdAt: string | null;
  tags: string[];
};

export type GeminiCatalogItem = {
  id: string;
  family: string;
  label: string;
  created: number;
  createdAt: string | null;
  tags: string[];
};

export type ModelSettingsResponse = {
  providers: ProviderModelSelections;
  legacyCustomModels: Record<ProviderId, string>;
  secrets: {
    openAiApiKeyConfigured: boolean;
    claudeApiKeyConfigured: boolean;
    geminiApiKeyConfigured: boolean;
  };
};

export const DEFAULT_CODEX_MODEL_SELECTIONS = [
  'gpt-5.4',
  'gpt-5.3-codex',
  'gpt-5',
  'gpt-5-mini',
] as const;

export const DEFAULT_CLAUDE_MODEL_SELECTIONS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5-20251001',
] as const;

export const DEFAULT_GEMINI_MODEL_SELECTIONS = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
] as const;

const PROVIDERS: ProviderId[] = ['codex', 'claude', 'gemini'];

const OPENAI_TEXT_MODEL_REJECT_SEGMENTS = [
  'audio',
  'image',
  'realtime',
  'transcribe',
  'tts',
  'search',
  'moderation',
] as const;

export function createEmptyProviderModelSelections(): ProviderModelSelections {
  return {
    codex: { selectedModelIds: [] },
    claude: { selectedModelIds: [] },
    gemini: { selectedModelIds: [] },
  };
}

export function normalizeModelSelectionList(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of input) {
    if (typeof value !== 'string') {
      continue;
    }
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed.slice(0, 120));
    if (normalized.length >= 40) {
      break;
    }
  }
  return normalized;
}

export function normalizeProviderModelSelections(input: unknown): ProviderModelSelections {
  const base = createEmptyProviderModelSelections();
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return base;
  }

  const record = input as Record<string, unknown>;
  for (const provider of PROVIDERS) {
    const rawProvider = record[provider];
    if (!rawProvider || typeof rawProvider !== 'object' || Array.isArray(rawProvider)) {
      continue;
    }
    const providerRecord = rawProvider as Record<string, unknown>;
    base[provider] = {
      selectedModelIds: normalizeModelSelectionList(providerRecord.selectedModelIds),
    };
  }

  return base;
}

export function normalizePartialProviderModelSelections(input: unknown): Partial<ProviderModelSelections> {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const record = input as Record<string, unknown>;
  const partial: Partial<ProviderModelSelections> = {};
  for (const provider of PROVIDERS) {
    if (!(provider in record)) {
      continue;
    }
    const rawProvider = record[provider];
    if (!rawProvider || typeof rawProvider !== 'object' || Array.isArray(rawProvider)) {
      partial[provider] = { selectedModelIds: [] };
      continue;
    }
    const providerRecord = rawProvider as Record<string, unknown>;
    partial[provider] = {
      selectedModelIds: normalizeModelSelectionList(providerRecord.selectedModelIds),
    };
  }

  return partial;
}

export function isOpenAiTextGenerationModelId(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  if (!normalized) {
    return false;
  }
  if (!normalized.startsWith('gpt') && !normalized.startsWith('chatgpt')) {
    return false;
  }
  return !OPENAI_TEXT_MODEL_REJECT_SEGMENTS.some((segment) => normalized.includes(segment));
}

export function deriveOpenAiModelFamily(modelId: string): string {
  if (modelId.startsWith('gpt-5.')) {
    return 'GPT-5.x';
  }
  if (modelId.startsWith('gpt-5')) {
    return 'GPT-5';
  }
  if (modelId.startsWith('gpt-4o-mini')) {
    return 'GPT-4o mini';
  }
  if (modelId.startsWith('gpt-4o')) {
    return 'GPT-4o';
  }
  if (modelId.startsWith('gpt-4.1')) {
    return 'GPT-4.1';
  }
  if (modelId.startsWith('gpt-4')) {
    return 'GPT-4';
  }
  if (modelId.startsWith('gpt-3.5')) {
    return 'GPT-3.5';
  }
  if (modelId.startsWith('chatgpt')) {
    return 'ChatGPT';
  }
  return 'OpenAI';
}

export function deriveOpenAiModelLabel(modelId: string): string {
  return modelId
    .replace(/^gpt-/, 'GPT-')
    .replace(/^chatgpt-/, 'ChatGPT-')
    .replace(/-/g, ' ');
}

export function deriveOpenAiModelTags(modelId: string): string[] {
  const tags: string[] = [];
  const normalized = modelId.toLowerCase();
  if (normalized.includes('codex')) {
    tags.push('Codex');
  }
  if (normalized.includes('chat-latest')) {
    tags.push('Latest');
  }
  if (/\d{4}-\d{2}-\d{2}/.test(normalized)) {
    tags.push('Snapshot');
  }
  if (normalized.includes('mini')) {
    tags.push('Mini');
  }
  if (normalized.includes('nano')) {
    tags.push('Nano');
  }
  if (normalized.includes('pro')) {
    tags.push('Pro');
  }
  return tags;
}

export function isClaudeModelId(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return normalized.startsWith('claude-');
}

export function deriveClaudeModelFamily(modelId: string): string {
  const normalized = modelId.toLowerCase();
  if (normalized.includes('opus')) {
    return 'Claude Opus';
  }
  if (normalized.includes('sonnet')) {
    return 'Claude Sonnet';
  }
  if (normalized.includes('haiku')) {
    return 'Claude Haiku';
  }
  return 'Claude';
}

export function deriveClaudeModelLabel(modelId: string, displayName?: string): string {
  if (displayName) {
    return displayName;
  }
  return modelId
    .replace(/^claude-/, 'Claude ')
    .replace(/-/g, ' ');
}

export function deriveClaudeModelTags(modelId: string): string[] {
  const tags: string[] = [];
  const normalized = modelId.toLowerCase();
  if (normalized.includes('opus')) {
    tags.push('Opus');
  }
  if (normalized.includes('sonnet')) {
    tags.push('Sonnet');
  }
  if (normalized.includes('haiku')) {
    tags.push('Haiku');
  }
  if (/\d{8}/.test(normalized)) {
    tags.push('Snapshot');
  }
  return tags;
}

export function isGeminiModelId(modelId: string): boolean {
  const normalized = modelId.trim().toLowerCase();
  return normalized.startsWith('gemini-');
}

export function deriveGeminiModelFamily(modelId: string): string {
  const normalized = modelId.toLowerCase();
  if (normalized.includes('gemini-2.5')) {
    return 'Gemini 2.5';
  }
  if (normalized.includes('gemini-2.0')) {
    return 'Gemini 2.0';
  }
  if (normalized.includes('gemini-1.5')) {
    return 'Gemini 1.5';
  }
  if (normalized.includes('gemini-1.0') || normalized.match(/^gemini-1\b/)) {
    return 'Gemini 1.0';
  }
  return 'Gemini';
}

export function deriveGeminiModelLabel(modelId: string, displayName?: string): string {
  if (displayName) {
    return displayName;
  }
  return modelId
    .replace(/^gemini-/, 'Gemini ')
    .replace(/-/g, ' ');
}

export function deriveGeminiModelTags(modelId: string): string[] {
  const tags: string[] = [];
  const normalized = modelId.toLowerCase();
  if (normalized.includes('pro')) {
    tags.push('Pro');
  }
  if (normalized.includes('flash')) {
    tags.push('Flash');
  }
  if (normalized.includes('lite')) {
    tags.push('Lite');
  }
  if (normalized.includes('nano')) {
    tags.push('Nano');
  }
  if (normalized.includes('ultra')) {
    tags.push('Ultra');
  }
  if (normalized.includes('exp') || normalized.includes('preview')) {
    tags.push('Preview');
  }
  return tags;
}
