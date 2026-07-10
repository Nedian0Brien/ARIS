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

  it('shrinks html/body min-height to the live visual viewport while the keyboard is open', () => {
    // 실기기 진단 오버레이 실측으로 확정된 마지막 원인: reset.css의
    // min-height: var(--app-vh)는 키보드 오픈 중 이전 높이(746)에 얼어붙어
    // 문서가 뷰포트(399)보다 커지고, iOS가 그 여백만큼 문서를 스크롤해
    // (sY=347=746-399) 컴포저를 화면 위로 밀어올렸다. 키보드가 열려 있는
    // 동안은 html/body의 min-height도 실제 보이는 높이를 따라야 한다.
    // (이 override는 PR #386에 있다가 #388에서 잘못 삭제됐던 규칙이다.)
    expect(iaShellCss).toMatch(
      /html\[data-keyboard-open='true'\],\s*\n\s*html\[data-keyboard-open='true'\] body\s*\{[^}]*min-height:\s*var\(--visual-viewport-height, 100dvh\);/,
    );
  });

  it('also shrinks the --app-vh wrapper chain (.app-shell-ia--chat-screen, .m-main) while the keyboard is open', () => {
    // body의 min-height만 줄여서는 부족하다(격리 재현 실측: bodyMinHeight가
    // 399로 적용돼도 bodyScrollHeight는 746 유지). 문서 높이는 자식 중 가장
    // 큰 박스가 결정하는데 .app-shell-ia와 .m-main이 각각
    // min-height: var(--app-vh)로 얼어붙은 746을 유지하며 body를 떠받치고
    // 있었다. 래퍼 체인 전체가 함께 줄어야 스크롤 여백이 사라진다.
    expect(iaShellCss).toMatch(
      /html\[data-keyboard-open='true'\] \.app-shell-ia--chat-screen,\s*\n\s*html\[data-keyboard-open='true'\] \.app-shell-ia--chat-screen \.m-main\s*\{[^}]*min-height:\s*var\(--visual-viewport-height, 100dvh\);/,
    );
  });

  it('follows the native focus scroll with translateY(--visual-viewport-offset-top) on the unclipped app-shell root', () => {
    // 실기기 오버레이 실측(2차): 콘텐츠 축소(body sh=399)가 정확히 적용돼도
    // iOS는 포커스 시점의 옛 레이아웃 기준으로 미리 결정한 스크롤(sY=347)을
    // 그대로 실행하고 이후 클램프하지 않는다. 콘텐츠 축소만으로는 막을 수
    // 없으므로, ChatGPT 웹과 동일하게 밀려난 만큼(offsetTop) 콘텐츠를 따라
    // 내려 뷰포트가 바라보는 자리에 콘텐츠를 겹친다. 스크롤이 없으면 0px라
    // no-op이므로 안드로이드/정상 축소 경로에는 영향이 없다.
    expect(iaShellCss).toMatch(
      /html\[data-keyboard-open='true'\] \.app-shell-ia--chat-screen\s*\{[^}]*transform:\s*translateY\(var\(--visual-viewport-offset-top, 0px\)\);/,
    );
  });

  it('never applies the pan-follow transform inside the overflow-hidden wrapper chain', () => {
    // 회귀 방지: 1차 팬-추종은 .pc-proto에 transform을 걸었는데, .pc-proto는
    // overflow: hidden인 .m-main/.m-main-scroll(높이=뷰포트) 안에 있어서
    // 내려간 하단 347px — 컴포저 포함 — 이 통째로 클리핑되어 화면에서
    // 사라졌다. rect 좌표는 클리핑의 영향을 받지 않아 rect 검증으로는 안
    // 잡힌다. transform은 세로 클리핑이 없는 app-shell 루트에만 건다.
    const withoutComments = iaShellCss.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toMatch(
      /\.pc-proto[^{]*\{[^}]*transform:\s*translateY\(var\(--visual-viewport-offset-top/,
    );
    expect(withoutComments).not.toMatch(
      /\.m-main[^{]*\{[^}]*transform:\s*translateY\(var\(--visual-viewport-offset-top/,
    );
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
