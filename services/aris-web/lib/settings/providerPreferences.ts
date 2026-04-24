import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { sanitizeCustomModel } from '@/lib/happy/modelPolicy';
import {
  createEmptyProviderModelSelections,
  DEFAULT_GEMINI_MODE_ID,
  normalizeGeminiModeSelectionId,
  normalizeModelSelectionList,
  normalizeProviderModelSelections,
  resolveCodexSelectionFromCatalog,
  sanitizeManualModelId,
  type ModelSettingsResponse,
  type ProviderId,
  type ProviderModelSelections,
} from '@/lib/settings/providerModels';
import { loadOpenAiCatalogItems } from '@/lib/settings/openAiCatalog';

type CustomModelMap = Record<ProviderId, string>;
type UiPreferenceSecretRecord = {
  customAiModels?: unknown;
  providerModelSelections?: unknown;
  openAiApiKeyEncrypted?: string | null;
  claudeApiKeyEncrypted?: string | null;
  geminiApiKeyEncrypted?: string | null;
};

export function parseLegacyCustomModels(raw: unknown): CustomModelMap {
  const record = (!raw || typeof raw !== 'object' || Array.isArray(raw))
    ? {}
    : raw as Record<string, unknown>;

  return {
    codex: sanitizeCustomModel(record.codex) ?? '',
    claude: sanitizeCustomModel(record.claude) ?? '',
    gemini: sanitizeCustomModel(record.gemini) ?? '',
  };
}

export function sanitizeProviderModelSelections(raw: unknown): ProviderModelSelections {
  const normalized = normalizeProviderModelSelections(raw);
  return {
    codex: {
      selectedModelIds: sanitizeModelSelectionList(normalized.codex.selectedModelIds),
      defaultModelId: normalized.codex.defaultModelId ?? null,
      defaultModeId: null,
    },
    claude: {
      selectedModelIds: sanitizeModelSelectionList(normalized.claude.selectedModelIds),
      defaultModelId: normalized.claude.defaultModelId ?? null,
      defaultModeId: null,
    },
    gemini: {
      selectedModelIds: sanitizeModelSelectionList(normalized.gemini.selectedModelIds),
      defaultModelId: normalized.gemini.defaultModelId ?? null,
      defaultModeId: normalizeGeminiModeSelectionId(normalized.gemini.defaultModeId) ?? DEFAULT_GEMINI_MODE_ID,
    },
  };
}

function sanitizeModelSelectionList(value: unknown): string[] {
  return normalizeModelSelectionList(value)
    .map((item) => sanitizeManualModelId(item))
    .filter((item): item is string => Boolean(item));
}

export async function getUserModelSettings(userId: string): Promise<ModelSettingsResponse> {
  const preference = await prisma.uiPreference.findUnique({
    where: { userId },
    select: {
      customAiModels: true,
      providerModelSelections: true,
      openAiApiKeyEncrypted: true,
      claudeApiKeyEncrypted: true,
      geminiApiKeyEncrypted: true,
    } as never,
  }) as UiPreferenceSecretRecord | null;

  const legacyCustomModels = parseLegacyCustomModels(preference?.customAiModels);
  const providers = sanitizeProviderModelSelections(preference?.providerModelSelections);

  if (preference?.openAiApiKeyEncrypted) {
    try {
      const codexCatalogItems = await loadOpenAiCatalogItems(preference.openAiApiKeyEncrypted);
      providers.codex = resolveCodexSelectionFromCatalog({
        catalogModelIds: codexCatalogItems.map((item) => item.id),
        storedSelectedModelIds: providers.codex.selectedModelIds,
        storedDefaultModelId: providers.codex.defaultModelId,
      });
    } catch (error) {
      console.error('Failed to load live OpenAI catalog for user model settings:', error);
    }
  }

  return {
    providers,
    legacyCustomModels,
    secrets: {
      openAiApiKeyConfigured: Boolean(preference?.openAiApiKeyEncrypted),
      claudeApiKeyConfigured: Boolean(preference?.claudeApiKeyEncrypted),
      geminiApiKeyConfigured: Boolean(preference?.geminiApiKeyEncrypted),
    },
  };
}

export async function saveUserModelSettings(input: {
  userId: string;
  providers?: Partial<ProviderModelSelections>;
  legacyCustomModels?: Partial<CustomModelMap>;
}) {
  const existing = await getUserModelSettings(input.userId);
  const nextProviders = createEmptyProviderModelSelections();
  nextProviders.codex.selectedModelIds = input.providers && Object.prototype.hasOwnProperty.call(input.providers, 'codex')
    ? sanitizeModelSelectionList(input.providers.codex?.selectedModelIds)
    : existing.providers.codex.selectedModelIds;
  nextProviders.codex.defaultModelId = input.providers && Object.prototype.hasOwnProperty.call(input.providers, 'codex')
    ? (input.providers.codex?.defaultModelId ?? nextProviders.codex.selectedModelIds[0] ?? null)
    : existing.providers.codex.defaultModelId ?? existing.providers.codex.selectedModelIds[0] ?? null;
  nextProviders.claude.selectedModelIds = input.providers && Object.prototype.hasOwnProperty.call(input.providers, 'claude')
    ? sanitizeModelSelectionList(input.providers.claude?.selectedModelIds)
    : existing.providers.claude.selectedModelIds;
  nextProviders.claude.defaultModelId = input.providers && Object.prototype.hasOwnProperty.call(input.providers, 'claude')
    ? (input.providers.claude?.defaultModelId ?? nextProviders.claude.selectedModelIds[0] ?? null)
    : existing.providers.claude.defaultModelId ?? existing.providers.claude.selectedModelIds[0] ?? null;
  nextProviders.gemini.selectedModelIds = input.providers && Object.prototype.hasOwnProperty.call(input.providers, 'gemini')
    ? sanitizeModelSelectionList(input.providers.gemini?.selectedModelIds)
    : existing.providers.gemini.selectedModelIds;
  nextProviders.gemini.defaultModelId = input.providers && Object.prototype.hasOwnProperty.call(input.providers, 'gemini')
    ? (sanitizeModelSelectionList([input.providers.gemini?.defaultModelId])[0] ?? nextProviders.gemini.selectedModelIds[0] ?? null)
    : existing.providers.gemini.defaultModelId ?? existing.providers.gemini.selectedModelIds[0] ?? null;
  nextProviders.gemini.defaultModeId = input.providers && Object.prototype.hasOwnProperty.call(input.providers, 'gemini')
    ? (normalizeGeminiModeSelectionId(input.providers.gemini?.defaultModeId) ?? DEFAULT_GEMINI_MODE_ID)
    : normalizeGeminiModeSelectionId(existing.providers.gemini.defaultModeId) ?? DEFAULT_GEMINI_MODE_ID;

  const nextLegacyCustomModels: CustomModelMap = {
    codex: sanitizeCustomModel(input.legacyCustomModels?.codex) ?? existing.legacyCustomModels.codex,
    claude: sanitizeCustomModel(input.legacyCustomModels?.claude) ?? existing.legacyCustomModels.claude,
    gemini: sanitizeCustomModel(input.legacyCustomModels?.gemini) ?? existing.legacyCustomModels.gemini,
  };

  return prisma.uiPreference.upsert({
    where: { userId: input.userId },
    update: {
      customAiModels: nextLegacyCustomModels,
      providerModelSelections: nextProviders,
    },
    create: {
      userId: input.userId,
      customAiModels: nextLegacyCustomModels,
      providerModelSelections: nextProviders,
    },
  });
}
