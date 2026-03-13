import 'server-only';

import { prisma } from '@/lib/db/prisma';
import { sanitizeCustomModel } from '@/lib/happy/modelPolicy';
import {
  createEmptyProviderModelSelections,
  normalizeModelSelectionList,
  normalizeProviderModelSelections,
  type ModelSettingsResponse,
  type ProviderId,
  type ProviderModelSelections,
} from '@/lib/settings/providerModels';

type CustomModelMap = Record<ProviderId, string>;

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
    codex: { selectedModelIds: sanitizeModelSelectionList(normalized.codex.selectedModelIds) },
    claude: { selectedModelIds: sanitizeModelSelectionList(normalized.claude.selectedModelIds) },
    gemini: { selectedModelIds: sanitizeModelSelectionList(normalized.gemini.selectedModelIds) },
  };
}

function sanitizeModelSelectionList(value: unknown): string[] {
  return normalizeModelSelectionList(value)
    .map((item) => sanitizeCustomModel(item))
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
    },
  });

  const legacyCustomModels = parseLegacyCustomModels(preference?.customAiModels);
  const providers = sanitizeProviderModelSelections(preference?.providerModelSelections);

  return {
    providers,
    legacyCustomModels,
    secrets: {
      openAiApiKeyConfigured: Boolean(preference?.openAiApiKeyEncrypted),
      claudeApiKeyConfigured: Boolean(preference?.claudeApiKeyEncrypted),
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
  nextProviders.claude.selectedModelIds = input.providers && Object.prototype.hasOwnProperty.call(input.providers, 'claude')
    ? sanitizeModelSelectionList(input.providers.claude?.selectedModelIds)
    : existing.providers.claude.selectedModelIds;
  nextProviders.gemini.selectedModelIds = input.providers && Object.prototype.hasOwnProperty.call(input.providers, 'gemini')
    ? sanitizeModelSelectionList(input.providers.gemini?.selectedModelIds)
    : existing.providers.gemini.selectedModelIds;

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
