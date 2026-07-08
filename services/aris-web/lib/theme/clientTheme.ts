import { readLocalStorage, writeLocalStorage } from '@/lib/browser/localStorage';

export type ThemeMode = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export const THEME_STORAGE_KEY = 'aris-theme';

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system';
}

export function readThemeMode(): ThemeMode {
  if (typeof window === 'undefined') {
    return 'system';
  }
  const stored = readLocalStorage(THEME_STORAGE_KEY);
  return isThemeMode(stored) ? stored : 'system';
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === 'light' || mode === 'dark') {
    return mode;
  }
  if (typeof window === 'undefined') {
    return 'light';
  }
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

// iOS Safari 15+는 하단 바가 축소될 때 그 영역을 theme-color 메타로 칠하므로
// 런타임 테마 전환 시에도 메타를 함께 갱신해야 한다.
// 최초 페인트 전 적용은 app/layout.tsx의 themeBootScript가 같은 로직으로 수행한다.
// 색상은 tokens.css의 --canvas와 동기 유지.
export function syncThemeColorMeta(resolved: ResolvedTheme): void {
  if (typeof document === 'undefined') {
    return;
  }
  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement('meta');
    meta.setAttribute('name', 'theme-color');
    document.head.appendChild(meta);
  }
  meta.setAttribute('content', resolved === 'dark' ? '#08090c' : '#F7F8FA');
}

export function applyTheme(mode: ThemeMode): ResolvedTheme {
  const resolved = resolveTheme(mode);
  if (typeof document !== 'undefined') {
    const root = document.documentElement;
    root.dataset.theme = resolved;
    root.dataset.themeMode = mode;
    syncThemeColorMeta(resolved);
  }
  writeLocalStorage(THEME_STORAGE_KEY, mode);
  return resolved;
}
