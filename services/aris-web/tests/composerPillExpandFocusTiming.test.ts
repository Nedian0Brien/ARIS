import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const __dirname = dirname(fileURLToPath(import.meta.url));
const surface = readFileSync(
  resolve(__dirname, '../components/project-chat/ProjectChatSurface.tsx'),
  'utf8',
);

describe('composer pill expand -> focus timing', () => {
  it('defers focus() to a requestAnimationFrame after the collapsed -> expanded transition commits', () => {
    // pill 상태의 .cmp 폼은 opacity:0 + pointer-events:none으로 숨겨져 있을 뿐이라
    // (포커스 자체는 가능해야 pill 탭이 즉시 키보드를 열 수 있다) expandComposer()
    // 직후 같은 틱에서 focus()하면 아직 리렌더 전인 숨김 상태의 요소를 포커스하게
    // 되어, 네이티브 "포커스 요소 스크롤"이 그 요소를 스크롤 대상에서 제외한다 —
    // 키보드는 열리지만 컴포저가 제자리에서 확장 애니메이션만 재생된다.
    expect(surface).toMatch(
      /if \(!wasCollapsed \|\| isComposerCollapsed \|\| !pendingComposerFocusRef\.current\) \{\s*\n\s*return;\s*\n\s*\}\s*\n\s*pendingComposerFocusRef\.current = false;\s*\n\s*const raf = requestAnimationFrame\(\(\) => \{\s*\n\s*composerInputRef\.current\?\.focus\(\);/,
    );
  });

  it('does not call focus() synchronously right after expandComposer() at the pill tap and skill-select call sites', () => {
    expect(surface).not.toMatch(/expandComposer\(\);\s*\n\s*composerInputRef\.current\?\.focus\(\);/);
  });

  it('sets the pending-focus intent before expanding from a collapsed pill tap', () => {
    expect(surface).toMatch(
      /onClick=\{\(\) => \{\s*\n\s*pendingComposerFocusRef\.current = true;\s*\n\s*expandComposer\(\);\s*\n\s*\}\}/,
    );
  });

  it('still focuses immediately when a skill is picked while the composer is already expanded (no hidden-element race there)', () => {
    expect(surface).toMatch(
      /if \(isComposerCollapsed\) \{[\s\S]*?pendingComposerFocusRef\.current = true;[\s\S]*?expandComposer\(\);\s*\n\s*\} else \{[\s\S]*?composerInputRef\.current\?\.focus\(\);\s*\n\s*\}\s*\n\s*\}, \[expandComposer, isComposerCollapsed, recordRecentSkill\]\);/,
    );
  });
});
