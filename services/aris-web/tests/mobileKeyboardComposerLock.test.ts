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

  it('keyboard-open never changes layout geometry — the native pan model invariant', () => {
    // 네이티브 팬 모델의 불변식: 키보드가 열려도 우리 레이아웃은 1px도
    // 반응하지 않는다. 브라우저의 visual viewport 팬이 유일한 대응
    // 메커니즘이다. 과거 축소 모델 보정들(min-height 축소, translateY
    // 팬-추종)은 네이티브 팬과 이중 보정되어 컴포저를 화면 밖으로 밀었다
    // (실기기 오버레이 실측으로 확정). data-keyboard-open에 게이트된
    // 규칙에는 기하(min-height/height/transform/position)를 바꾸는 선언이
    // 없어야 한다 — 허용되는 것은 입력창 자체의 max-height 상한뿐.
    const withoutComments = iaShellCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const gatedBlocks = [...withoutComments.matchAll(/\[data-keyboard-open='true'\][^{]*\{([^}]*)\}/g)];
    expect(gatedBlocks.length).toBeGreaterThan(0);
    for (const [, body] of gatedBlocks) {
      expect(body).not.toMatch(/(?<!max-)(min-height|height)\s*:/);
      expect(body).not.toMatch(/transform\s*:/);
      expect(body).not.toMatch(/position\s*:/);
    }
  });

  it('does not opt into interactive-widget viewport resizing (the pan model relies on the resizes-visual default)', () => {
    // interactive-widget=resizes-content를 지정하면 iOS가 키보드 오픈 시
    // 레이아웃 뷰포트까지 줄인다(최신 iOS는 실제로 지원). 그러면 뷰포트
    // 단위/라이브 변수 기반 축소와 네이티브 팬이 이중 보정되는 하이브리드가
    // 되어 컴포저가 화면 밖으로 나간다 — 이 지정이 버그 연쇄의 시작점이었다.
    const rootLayout = readFileSync(resolve(__dirname, '../app/layout.tsx'), 'utf8');
    expect(rootLayout).not.toContain("interactiveWidget: 'resizes-content'");
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
    expect(viewportHeightSync).toMatch(/handleDocumentFocusOut[\s\S]*?optimisticKeyboardOpenUntil = 0;/);
  });

  it('keeps data-keyboard-open true for the whole focus lifetime on touch devices (ChatGPT model)', () => {
    // 실기기 3차 실측: interactive-widget=resizes-content 하에서는 innerHeight도
    // 함께 줄어 bottomInset이 0이 되므로 기하 측정으로는 키보드를 감지할 수
    // 없고, 700ms 낙관적 창은 iOS 키보드 확정(+714ms)·스크롤(+827ms)보다
    // 먼저 만료된다. 판정은 포커스-수명 기반 computeKeyboardOpen을 쓴다.
    expect(viewportHeightSync).toContain(
      "import { computeKeyboardOpen } from '@/components/layout/viewportKeyboardState';",
    );
    expect(viewportHeightSync).toMatch(
      /const keyboardOpen = computeKeyboardOpen\(\{[\s\S]*?focusedTextInput,[\s\S]*?coarsePointer,[\s\S]*?\}\);/,
    );
    expect(viewportHeightSync).not.toContain('const keyboardOpen = bottomInset > threshold || withinOptimisticWindow;');
  });
});
