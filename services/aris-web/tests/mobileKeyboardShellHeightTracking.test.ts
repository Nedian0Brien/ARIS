import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { readCssWithImports } from './helpers/readAppStyles';

const __dirname = dirname(fileURLToPath(import.meta.url));
const uiResponsiveCss = readCssWithImports(resolve(__dirname, '../app/styles/ui-responsive.css'));

describe('mobile chat shell keeps keyboard-frozen geometry (native pan model)', () => {
  // 네이티브 팬 모델의 불변식: 키보드가 열려도 셸 기하는 1px도 반응하지
  // 않는다. --app-vh는 키보드 오픈 중 이전 높이에 동결되는데, 그게 정확히
  // 원하는 것이다 — 셸이 가만히 있어야 브라우저의 visual viewport 팬이
  // 컴포저(동결된 셸의 바닥)를 키보드 위 제자리에 보여준다.
  // 라이브 값(--visual-viewport-height)으로 바꾸면 셸 축소 + 네이티브 팬의
  // 이중 보정이 되어 컴포저가 화면 밖으로 나간다(실기기 오버레이 실측으로
  // 확정된 회귀 — 이 파일의 이전 버전이 바로 그 회귀를 강제하고 있었다).

  it('drives .aris-ia-shell, .pc-proto and .shell from the keyboard-frozen --app-vh', () => {
    expect(uiResponsiveCss).toMatch(
      /\.app-shell-ia--chat-screen \.aris-ia-shell \{[^}]*min-height:\s*var\(--app-vh, 100dvh\);/s,
    );
    expect(uiResponsiveCss).toMatch(
      /\.m-main-scroll--project-chat-detail \.pc-proto \{[^}]*min-height:\s*var\(--app-vh, 100dvh\);/s,
    );
    expect(uiResponsiveCss).toMatch(
      /\.m-main-scroll--project-chat-detail \.pc-proto \.shell \{[^}]*height:\s*var\(--app-vh, 100dvh\);/s,
    );
  });

  it('never references the live --visual-viewport-height for shell geometry', () => {
    const withoutComments = uiResponsiveCss.replace(/\/\*[\s\S]*?\*\//g, '');
    const shellBlocks = [
      /\.app-shell-ia--chat-screen \.aris-ia-shell \{([^}]*)\}/s,
      /\.m-main-scroll--project-chat-detail \.pc-proto \{([^}]*)\}/s,
      /\.pc-parallel \{([^}]*)\}/s,
      /\.m-main-scroll--project-chat-detail \.pc-proto \.shell \{([^}]*)\}/s,
    ];
    for (const pattern of shellBlocks) {
      const block = withoutComments.match(pattern)?.[1] ?? '';
      expect(block).not.toContain('--visual-viewport-height');
    }
  });
});
