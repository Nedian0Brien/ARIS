import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readCssWithImports } from './helpers/readAppStyles';

const __dirname = dirname(fileURLToPath(import.meta.url));
const iaShellCss = readCssWithImports(resolve(__dirname, '../app/styles/ia-shell.css'));
const resetCss = readCssWithImports(resolve(__dirname, '../app/styles/reset.css'));
const layoutCss = readCssWithImports(resolve(__dirname, '../app/styles/layout.css'));
const viewportHeightSync = readFileSync(
  resolve(__dirname, '../components/layout/ViewportHeightSync.tsx'),
  'utf8',
);

describe('mobile keyboard composer — cooperates with native scroll instead of fighting it', () => {
  it('never locks html/body position on mobile keyboard open — position:static -> fixed cannot be transitioned and caused a visible snap', () => {
    // ChatGPT 웹 모바일 실측 결과와 동일한 전략: html/body의 position은 절대
    // 바꾸지 않는다. 이전엔 data-keyboard-open일 때 position:fixed로 강제
    // 잠갔는데, position 전환은 스펙상 transition이 불가능해 네이티브 스크롤
    // 직후 "순간이동"으로 보였다.
    // 실제 CSS 규칙 블록(주석 제외)에서 data-keyboard-open 선택자와
    // position:fixed 선언이 같은 규칙 안에 함께 있으면 안 된다.
    const withoutComments = iaShellCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(/html\[data-keyboard-open='true'\][^{]*\{[^}]*position:\s*fixed/);
  });

  it("uses overflow-x: clip (not hidden) on html/body so overflow-y is never auto-promoted", () => {
    // CSS Overflow 스펙: overflow-x가 non-visible이고 overflow-y가 미지정이면
    // overflow-y가 auto로 자동 승격된다. hidden은 이 승격을 트리거하지만
    // clip은 트리거하지 않는다 — 이게 키보드가 열린 동안 body에 불필요한
    // 스크롤 여백이 생기던 진짜 원인이었다.
    expect(resetCss).toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*clip;/s);
    expect(resetCss).not.toMatch(/html,\s*body\s*\{[^}]*overflow-x:\s*hidden;/s);
  });

  it('still preserves the intentional page-scroll model on mobile (iOS toolbar auto-hide)', () => {
    // layout.css가 모바일에서 .app-shell-ia--chat-screen을 의도적으로
    // overflow:visible/height:auto로 두는 것은 이번 재설계와 방향이 같다 —
    // 둘 다 "막지 않고 네이티브 스크롤에 맡긴다"는 동일한 철학이다.
    expect(layoutCss).toMatch(
      /@media \(max-width: 960px\) \{[\s\S]*?\.app-shell-chat-screen,\s*\n\s*\.app-shell-ia--chat-screen\s*\{[^}]*overflow:\s*visible;/,
    );
  });

  it('keeps the composer auto-grow cap tied to the live viewport, with a transition so it never snaps', () => {
    // position/scroll과 무관한 순수 시각적 제약이라 네이티브 스크롤과
    // 경합하지 않는다. transition을 둬서 그 자체도 부드럽게 바뀐다.
    expect(iaShellCss).toContain('transition: max-height 150ms var(--ease-smooth, ease);');
    expect(iaShellCss).toContain(
      "max-height: min(200px, calc(var(--visual-viewport-height, 100dvh) * 0.3));",
    );
  });

  it('flips data-keyboard-open optimistically on focus instead of waiting for a visualViewport resize', () => {
    // position 잠금에는 더 이상 쓰이지 않지만, 컴포저 auto-grow 상한이
    // 최대한 빨리 정확한 값을 참조하도록 이 메커니즘은 유지한다.
    expect(viewportHeightSync).toContain('OPTIMISTIC_KEYBOARD_LOCK_MS');
    expect(viewportHeightSync).toContain('optimisticKeyboardOpenUntil = performance.now() + OPTIMISTIC_KEYBOARD_LOCK_MS');
    expect(viewportHeightSync).toContain('const keyboardOpen = bottomInset > threshold || withinOptimisticWindow;');
    expect(viewportHeightSync).toMatch(/handleDocumentFocusOut[\s\S]*?optimisticKeyboardOpenUntil = 0;/);
  });
});
