import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  readLastSelectedModelId,
  resolvePreferredModelId,
  writeLastSelectedModelId,
} from '@/app/sessions/[sessionId]/chatModelPreferences';

const globalWithDom = globalThis as typeof globalThis & {
  window?: Window & typeof globalThis;
};
const originalWindow = globalThis.window;

describe('chatModelPreferences', () => {
  afterEach(() => {
    if (originalWindow === undefined) {
      Reflect.deleteProperty(globalWithDom, 'window');
    } else {
      globalWithDom.window = originalWindow;
    }
    vi.restoreAllMocks();
  });

  it('prefers the cached model for new Codex chats when it is still available', () => {
    expect(resolvePreferredModelId({
      availableModelIds: ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5-mini'],
      cachedModelId: 'gpt-5.3-codex',
      configuredDefaultModelId: 'gpt-5.4',
      fallbackModelId: 'gpt-5.4',
    })).toBe('gpt-5.3-codex');
  });

  it('falls back to the configured default when the cached model is no longer available', () => {
    expect(resolvePreferredModelId({
      availableModelIds: ['gpt-5.4', 'gpt-5-mini'],
      cachedModelId: 'gpt-5.3-codex',
      configuredDefaultModelId: 'gpt-5-mini',
      fallbackModelId: 'gpt-5.4',
    })).toBe('gpt-5-mini');
  });

  it('reads and writes the last selected Codex model through localStorage helpers', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
    } as unknown as Storage;
    globalWithDom.window = { localStorage: storage } as unknown as Window & typeof globalThis;

    expect(writeLastSelectedModelId('codex', 'gpt-5.3-codex')).toBe(true);
    expect(readLastSelectedModelId('codex')).toBe('gpt-5.3-codex');
  });
});
