import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchProviderModels } from '@/lib/settings/useProviderModels';
import type { ModelSettingsResponse } from '@/lib/settings/providerModels';

afterEach(() => {
  vi.unstubAllGlobals();
});

const MOCK_RESPONSE: ModelSettingsResponse = {
  providers: {
    codex: { selectedModelIds: ['gpt-5-mini'], defaultModelId: 'gpt-5-mini', defaultModeId: null },
    claude: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
    gemini: { selectedModelIds: [], defaultModelId: null, defaultModeId: null },
  },
  legacyCustomModels: { codex: '', claude: '', gemini: '' },
  secrets: {
    openAiApiKeyConfigured: true,
    claudeApiKeyConfigured: false,
    geminiApiKeyConfigured: false,
  },
};

describe('fetchProviderModels', () => {
  it('returns parsed data on successful fetch', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(MOCK_RESPONSE), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const data = await fetchProviderModels();
    expect(data.providers.codex.defaultModelId).toBe('gpt-5-mini');
    expect(data.secrets.openAiApiKeyConfigured).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('throws on HTTP error response', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(
      new Response('boom', { status: 500 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProviderModels()).rejects.toThrow('HTTP 500');
  });

  it('throws on network failure', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('network error'));
    vi.stubGlobal('fetch', fetchMock);

    await expect(fetchProviderModels()).rejects.toThrow('network error');
  });
});
