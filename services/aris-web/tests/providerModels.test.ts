import { describe, expect, it } from 'vitest';
import {
  DEFAULT_GEMINI_MODE_ID,
  isAllowedGeminiSelectionModelId,
  normalizeGeminiModeSelectionId,
  isOpenAiTextGenerationModelId,
  normalizeProviderModelSelections,
  normalizePartialProviderModelSelections,
  resolveCodexSelectionFromCatalog,
} from '@/lib/settings/providerModels';

describe('providerModels', () => {
  it('filters OpenAI text generation models by id pattern', () => {
    expect(isOpenAiTextGenerationModelId('gpt-5.4')).toBe(true);
    expect(isOpenAiTextGenerationModelId('gpt-5.3-codex')).toBe(true);
    expect(isOpenAiTextGenerationModelId('gpt-4o')).toBe(true);
    expect(isOpenAiTextGenerationModelId('gpt-4o-mini-realtime-preview')).toBe(false);
    expect(isOpenAiTextGenerationModelId('gpt-image-1')).toBe(false);
    expect(isOpenAiTextGenerationModelId('gpt-audio-1.5')).toBe(false);
    expect(isOpenAiTextGenerationModelId('gpt-5-search-api')).toBe(false);
  });

  it('normalizes full provider selections with dedupe and defaults', () => {
    expect(normalizeProviderModelSelections({
      codex: { selectedModelIds: ['gpt-5.4', 'gpt-5.4', 'gpt-5.3-codex'] },
    })).toEqual({
      codex: { selectedModelIds: ['gpt-5.4', 'gpt-5.3-codex'], defaultModelId: 'gpt-5.4', defaultModeId: null },
      claude: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
      gemini: { selectedModelIds: [], defaultModelId: null, defaultModeId: DEFAULT_GEMINI_MODE_ID },
    });
  });

  it('normalizes partial provider selections without forcing absent providers', () => {
    expect(normalizePartialProviderModelSelections({
      codex: { selectedModelIds: ['gpt-5.4', 'gpt-5.3-codex'], defaultModelId: 'gpt-5.3-codex' },
    })).toEqual({
      codex: { selectedModelIds: ['gpt-5.4', 'gpt-5.3-codex'], defaultModelId: 'gpt-5.3-codex', defaultModeId: null },
    });
  });

  it('uses the full live OpenAI catalog when no Codex selection has been saved yet', () => {
    expect(resolveCodexSelectionFromCatalog({
      catalogModelIds: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
      storedSelectedModelIds: [],
      storedDefaultModelId: null,
    })).toEqual({
      selectedModelIds: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
      defaultModelId: 'gpt-5.5',
      defaultModeId: null,
    });
  });

  it('upgrades the legacy hardcoded Codex defaults to the live OpenAI catalog', () => {
    expect(resolveCodexSelectionFromCatalog({
      catalogModelIds: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
      storedSelectedModelIds: ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'gpt-5', 'gpt-5-mini'],
      storedDefaultModelId: 'gpt-5.4',
    })).toEqual({
      selectedModelIds: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
      defaultModelId: 'gpt-5.4',
      defaultModeId: null,
    });
  });

  it('preserves a custom Codex subset while dropping models missing from the live catalog', () => {
    expect(resolveCodexSelectionFromCatalog({
      catalogModelIds: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini'],
      storedSelectedModelIds: ['gpt-5.5', 'gpt-5-mini'],
      storedDefaultModelId: 'gpt-5-mini',
    })).toEqual({
      selectedModelIds: ['gpt-5.5'],
      defaultModelId: 'gpt-5.5',
      defaultModeId: null,
    });
  });

  it('filters Gemini selections down to runtime-safe models only', () => {
    expect(normalizeProviderModelSelections({
      gemini: { selectedModelIds: ['gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-pro'] },
    })).toEqual({
      codex: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
      claude: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
      gemini: {
        selectedModelIds: ['gemini-3-flash-preview', 'gemini-2.5-pro'],
        defaultModelId: 'gemini-3-flash-preview',
        defaultModeId: DEFAULT_GEMINI_MODE_ID,
      },
    });
    expect(isAllowedGeminiSelectionModelId('gemini-3-flash-preview')).toBe(true);
    expect(isAllowedGeminiSelectionModelId('gemini-2.5-flash')).toBe(true);
    expect(isAllowedGeminiSelectionModelId('auto-gemini-3')).toBe(true);
    expect(isAllowedGeminiSelectionModelId('gemini-3.1-pro-preview')).toBe(false);
  });

  it('upgrades the legacy Gemini default trio to include auto-gemini-3 first', () => {
    expect(normalizeProviderModelSelections({
      gemini: { selectedModelIds: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'] },
    })).toEqual({
      codex: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
      claude: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
      gemini: {
        selectedModelIds: ['auto-gemini-3', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
        defaultModelId: 'auto-gemini-3',
        defaultModeId: DEFAULT_GEMINI_MODE_ID,
      },
    });
  });

  it('normalizes Gemini default model and mode selections', () => {
    expect(normalizeProviderModelSelections({
      gemini: {
        selectedModelIds: ['gemini-3-flash-preview', 'gemini-2.5-pro'],
        defaultModelId: 'gemini-2.5-pro',
        defaultModeId: 'auto_edit',
      },
    })).toEqual({
      codex: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
      claude: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
      gemini: {
        selectedModelIds: ['gemini-3-flash-preview', 'gemini-2.5-pro'],
        defaultModelId: 'gemini-2.5-pro',
        defaultModeId: 'autoEdit',
      },
    });
    expect(normalizeGeminiModeSelectionId('auto_edit')).toBe('autoEdit');
    expect(normalizeGeminiModeSelectionId('yolo')).toBe('yolo');
  });
});
