import { describe, expect, it } from 'vitest';
import { buildOpenAiCatalogItems } from '@/lib/settings/openAiCatalog';

describe('openAiCatalog', () => {
  it('builds a live Codex catalog from the OpenAI models payload without hardcoded fallbacks', () => {
    expect(buildOpenAiCatalogItems({
      data: [
        { id: 'gpt-5.4', created: 1710000000 },
        { id: 'gpt-5.5', created: 1720000000 },
        { id: 'gpt-5-search-preview', created: 1730000000 },
        { id: 'gpt-image-1', created: 1740000000 },
      ],
    })).toEqual([
      {
        id: 'gpt-5.5',
        family: 'GPT-5.x',
        label: 'GPT 5.5',
        created: 1720000000,
        createdAt: new Date(1720000000 * 1000).toISOString(),
        tags: [],
      },
      {
        id: 'gpt-5.4',
        family: 'GPT-5.x',
        label: 'GPT 5.4',
        created: 1710000000,
        createdAt: new Date(1710000000 * 1000).toISOString(),
        tags: [],
      },
    ]);
  });
});
