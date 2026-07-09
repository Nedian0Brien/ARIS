import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readCssWithImports } from './helpers/readAppStyles';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiResponsiveCss = readCssWithImports(resolve(__dirname, '../app/styles/ui-responsive.css'));

describe('mobile chat shell tracks the live visual viewport height', () => {
  // 실기기 스크린샷으로 재확인된 회귀: overflow-x: clip 수정만으로는 부족했다.
  // .aris-ia-shell/.pc-proto/.shell이 여전히 얼어붙은 --app-vh(키보드가 열린
  // 동안 이전 높이에 고정)를 쓰고 있었고, 셸 전체가 실제 보이는 영역보다
  // 훨씬 커진 채로 남아 네이티브 "포커스 요소 스크롤"이 그 차이만큼 페이지를
  // 과도하게 끌어올려 컴포저가 화면 맨 위까지 튀었다. position은 절대 건드리지
  // 않고(전과 동일) 셸의 height/min-height만 --visual-viewport-height를
  // 따르도록 복원한다 — 숫자 값이라 transition으로 부드럽게 이어진다.

  it('drives .aris-ia-shell, .pc-proto and .shell from --visual-viewport-height, not the keyboard-frozen --app-vh', () => {
    expect(uiResponsiveCss).toMatch(
      /\.app-shell-ia--chat-screen \.aris-ia-shell \{[^}]*min-height:\s*var\(--visual-viewport-height, 100dvh\);/s,
    );
    expect(uiResponsiveCss).toMatch(
      /\.m-main-scroll--project-chat-detail \.pc-proto \{[^}]*min-height:\s*var\(--visual-viewport-height, 100dvh\);/s,
    );
    expect(uiResponsiveCss).toMatch(
      /\.m-main-scroll--project-chat-detail \.pc-proto \.shell \{[^}]*height:\s*var\(--visual-viewport-height, 100dvh\);/s,
    );
  });

  it('transitions height/min-height smoothly instead of snapping (position is never touched, so this is safe)', () => {
    const shellBlock = uiResponsiveCss.match(/\.m-main-scroll--project-chat-detail \.pc-proto \.shell \{([^}]*)\}/s)?.[1] ?? '';
    expect(shellBlock).toContain('transition: height 200ms');
    const ariaShellBlock = uiResponsiveCss.match(/\.app-shell-ia--chat-screen \.aris-ia-shell \{([^}]*)\}/s)?.[1] ?? '';
    expect(ariaShellBlock).toContain('transition: min-height 200ms');
  });
});
