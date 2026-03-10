import { afterEach, describe, expect, it, vi } from 'vitest';
import { readLocalStorage, removeLocalStorage, writeLocalStorage } from '@/lib/browser/localStorage';
import { applyTheme, readThemeMode } from '@/lib/theme/clientTheme';

const globalWithDom = globalThis as typeof globalThis & {
  window?: Window & typeof globalThis;
  document?: Document;
};
const originalWindow = globalThis.window;
const originalDocument = globalThis.document;

afterEach(() => {
  if (originalWindow === undefined) {
    Reflect.deleteProperty(globalWithDom, 'window');
  } else {
    globalWithDom.window = originalWindow;
  }

  if (originalDocument === undefined) {
    Reflect.deleteProperty(globalWithDom, 'document');
  } else {
    globalWithDom.document = originalDocument;
  }

  vi.restoreAllMocks();
});

describe('safe localStorage helpers', () => {
  it('returns null or false when localStorage access throws', () => {
    const throwingWindow = {
      get localStorage() {
        throw new Error('SecurityError');
      },
    } as unknown as Window & typeof globalThis;

    globalWithDom.window = throwingWindow;

    expect(readLocalStorage('foo')).toBeNull();
    expect(writeLocalStorage('foo', 'bar')).toBe(false);
    expect(removeLocalStorage('foo')).toBe(false);
  });

  it('reads and writes through when localStorage is available', () => {
    const values = new Map<string, string>();
    const storage = {
      getItem: vi.fn((key: string) => values.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        values.set(key, value);
      }),
      removeItem: vi.fn((key: string) => {
        values.delete(key);
      }),
    } as unknown as Storage;

    globalWithDom.window = { localStorage: storage } as unknown as Window & typeof globalThis;

    expect(writeLocalStorage('foo', 'bar')).toBe(true);
    expect(readLocalStorage('foo')).toBe('bar');
    expect(removeLocalStorage('foo')).toBe(true);
    expect(readLocalStorage('foo')).toBeNull();
  });
});

describe('clientTheme', () => {
  it('falls back to system mode when localStorage is unavailable', () => {
    const throwingWindow = {
      get localStorage() {
        throw new Error('SecurityError');
      },
      matchMedia: vi.fn(() => ({ matches: false })),
    } as unknown as Window & typeof globalThis;

    globalWithDom.window = throwingWindow;
    globalWithDom.document = {
      documentElement: {
        dataset: {},
      },
    } as unknown as Document;

    expect(readThemeMode()).toBe('system');
    expect(applyTheme('dark')).toBe('dark');
    expect(globalThis.document.documentElement.dataset.theme).toBe('dark');
    expect(globalThis.document.documentElement.dataset.themeMode).toBe('dark');
  });
});
