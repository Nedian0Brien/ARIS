import { describe, expect, it } from 'vitest';
import {
  isAllowedGeminiSelectionModelId,
  isOpenAiTextGenerationModelId,
  normalizeProviderModelSelections,
  normalizePartialProviderModelSelections,
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
      codex: { selectedModelIds: ['gpt-5.4', 'gpt-5.3-codex'] },
      claude: { selectedModelIds: [] },
      gemini: { selectedModelIds: [] },
    });
  });

  it('normalizes partial provider selections without forcing absent providers', () => {
    expect(normalizePartialProviderModelSelections({
      codex: { selectedModelIds: ['gpt-5.4'] },
    })).toEqual({
      codex: { selectedModelIds: ['gpt-5.4'] },
    });
  });

  it('filters Gemini selections down to runtime-safe models only', () => {
    expect(normalizeProviderModelSelections({
      gemini: { selectedModelIds: ['gemini-3.1-pro-preview', 'gemini-2.5-pro', 'gemini-2.5-pro'] },
    })).toEqual({
      codex: { selectedModelIds: [] },
      claude: { selectedModelIds: [] },
      gemini: { selectedModelIds: ['gemini-2.5-pro'] },
    });
    expect(isAllowedGeminiSelectionModelId('gemini-2.5-flash')).toBe(true);
    expect(isAllowedGeminiSelectionModelId('gemini-3.1-pro-preview')).toBe(false);
  });
});
