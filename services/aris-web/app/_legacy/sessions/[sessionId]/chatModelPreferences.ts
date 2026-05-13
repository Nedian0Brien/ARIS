'use client';

import { readLocalStorage, writeLocalStorage } from '@/lib/browser/localStorage';
import type { AgentFlavor } from '@/lib/happy/types';

const LAST_SELECTED_MODEL_STORAGE_KEYS: Record<AgentFlavor, string> = {
  codex: 'aris:last-selected-model:codex',
  claude: 'aris:last-selected-model:claude',
  gemini: 'aris:last-selected-model:gemini',
  unknown: 'aris:last-selected-model:unknown',
};

function normalizeStoredModelId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function readLastSelectedModelId(agent: AgentFlavor): string | null {
  return normalizeStoredModelId(readLocalStorage(LAST_SELECTED_MODEL_STORAGE_KEYS[agent]));
}

export function writeLastSelectedModelId(agent: AgentFlavor, modelId: string): boolean {
  const normalized = normalizeStoredModelId(modelId);
  if (!normalized) {
    return false;
  }
  return writeLocalStorage(LAST_SELECTED_MODEL_STORAGE_KEYS[agent], normalized);
}

export function resolvePreferredModelId(input: {
  availableModelIds: string[];
  cachedModelId?: string | null;
  configuredDefaultModelId?: string | null;
  fallbackModelId?: string | null;
}): string | null {
  const availableModelIds = input.availableModelIds.filter((modelId) => modelId.trim().length > 0);
  if (availableModelIds.length === 0) {
    return normalizeStoredModelId(input.fallbackModelId);
  }

  const availableSet = new Set(availableModelIds);
  const cachedModelId = normalizeStoredModelId(input.cachedModelId ?? null);
  if (cachedModelId && availableSet.has(cachedModelId)) {
    return cachedModelId;
  }

  const configuredDefaultModelId = normalizeStoredModelId(input.configuredDefaultModelId ?? null);
  if (configuredDefaultModelId && availableSet.has(configuredDefaultModelId)) {
    return configuredDefaultModelId;
  }

  const fallbackModelId = normalizeStoredModelId(input.fallbackModelId ?? null);
  if (fallbackModelId && availableSet.has(fallbackModelId)) {
    return fallbackModelId;
  }

  return availableModelIds[0] ?? null;
}
