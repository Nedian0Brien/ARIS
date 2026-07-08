import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readCssWithImports } from './helpers/readAppStyles';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iaShellCss = readCssWithImports(resolve(__dirname, '../app/styles/ia-shell.css'));
const layoutCss = readCssWithImports(resolve(__dirname, '../app/styles/layout.css'));
const viewportHeightSync = readFileSync(
  resolve(__dirname, '../components/layout/ViewportHeightSync.tsx'),
  'utf8',
);

describe('mobile keyboard composer lock', () => {
  it('pins html/body to the live visual viewport (with offsetTop) only while the keyboard is open', () => {
    expect(iaShellCss).toMatch(
      /html\[data-keyboard-open='true'\],\s*\n\s*html\[data-keyboard-open='true'\] body\s*\{[^}]*position:\s*fixed;/,
    );
    expect(iaShellCss).toContain('top: var(--visual-viewport-offset-top, 0px);');
    expect(iaShellCss).toContain('height: var(--visual-viewport-height, 100dvh);');
  });

  it('does not lock html/body unconditionally on mobile — layout.css deliberately keeps the chat screen page-scrollable so iOS auto-hides its toolbar', () => {
    // 이 규칙을 지우면 키보드 버그는 막히지만 iOS Safari 주소창 자동 숨김 UX가
    // 깨진다(layout.css 상단 주석 참고). data-keyboard-open으로 좁혀 적용해야 한다.
    expect(layoutCss).toMatch(
      /@media \(max-width: 960px\) \{[\s\S]*?\.app-shell-chat-screen,\s*\n\s*\.app-shell-ia--chat-screen\s*\{[^}]*overflow:\s*visible;/,
    );

    // ia-shell.css가 --visual-viewport-height로 .app-shell-ia--chat-screen의
    // height를 override하는 곳은 전부 data-keyboard-open 게이트 안에 있어야 한다
    // (게이트 없이 상시 적용하면 위 layout.css의 의도된 동작을 깨뜨린다).
    const gatedOccurrences = iaShellCss.match(/html\[data-keyboard-open='true'\][^{]*\.app-shell-ia--chat-screen[^{]*\{\s*\n\s*height:\s*var\(--visual-viewport-height/g) ?? [];
    const ungatedOccurrences = iaShellCss.match(/(?:^|\n)\.app-shell-ia--chat-screen\s*\{\s*\n\s*height:\s*var\(--visual-viewport-height/g) ?? [];
    expect(gatedOccurrences.length).toBeGreaterThan(0);
    expect(ungatedOccurrences.length).toBe(0);
  });

  it('locks the composer auto-grow cap to the live viewport while the keyboard is open', () => {
    expect(iaShellCss).toContain(
      "max-height: min(200px, calc(var(--visual-viewport-height, 100dvh) * 0.3));",
    );
  });

  it('flips data-keyboard-open optimistically on focus instead of waiting for a visualViewport resize', () => {
    // 실기기에서 iOS의 네이티브 "포커스 요소 스크롤"이 우리 쪽 resize 기반 감지보다
    // 먼저 실행되는 경합이 있었다. resize를 기다리지 않고 포커스 시점에 곧바로
    // 잠가서 그 경합 자체를 없앤다.
    expect(viewportHeightSync).toContain('OPTIMISTIC_KEYBOARD_LOCK_MS');
    expect(viewportHeightSync).toContain('optimisticKeyboardOpenUntil = performance.now() + OPTIMISTIC_KEYBOARD_LOCK_MS');
    expect(viewportHeightSync).toContain('const keyboardOpen = bottomInset > threshold || withinOptimisticWindow;');
    // blur는 낙관적 잠금을 즉시 풀어야 한다 — 실제로 열려 있었다면 이어지는
    // 측정이 다시 true를 확인해 준다.
    expect(viewportHeightSync).toMatch(/handleDocumentFocusOut[\s\S]*?optimisticKeyboardOpenUntil = 0;/);
  });
});
