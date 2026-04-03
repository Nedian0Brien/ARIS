# Chat Debug Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 채팅 UI에 디버그 모드를 추가하고, 화면 폭에 따라 헤더/메뉴에 토글을 배치하며, 활성화 시 원문 응답을 읽기 좋게 렌더링한다.

**Architecture:** `ChatInterface`가 상태와 배치 결정을 담당하고, 별도 helper file이 배치 기준과 transcript 판별 같은 순수 로직을 가진다. 렌더링은 기존 마크다운 렌더러를 최대한 재사용하고, transcript일 때만 bash 하이라이팅으로 전환한다. 저장은 하지 않으므로 새로고침하면 항상 꺼진다.

**Tech Stack:** Next.js, React 19, CSS Modules, Lucide React, Vitest

---

### Task 1: Debug mode helper와 헤더 배치 기준 추가

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chatDebugMode.ts`
- Modify: `services/aris-web/tests/chatDebugMode.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { looksLikeShellTranscript, shouldShowDebugToggleInHeader } from '@/app/sessions/[sessionId]/chatDebugMode';

describe('chatDebugMode helpers', () => {
  it('shows the debug toggle in the header only when the header is wide enough', () => {
    expect(shouldShowDebugToggleInHeader(0, false)).toBe(false);
    expect(shouldShowDebugToggleInHeader(1199, false)).toBe(false);
    expect(shouldShowDebugToggleInHeader(1200, false)).toBe(true);
  });

  it('detects shell transcript style bodies', () => {
    expect(looksLikeShellTranscript('$ ls -la\nfile.txt\nexit code: 0')).toBe(true);
    expect(looksLikeShellTranscript('일반적인 요약 문장입니다.')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatDebugMode.test.ts`
Expected: FAIL because the helper file does not exist yet.

- [ ] **Step 3: Write minimal implementation**

Create the helper with:
- a header-width threshold constant
- `shouldShowDebugToggleInHeader(headerWidth, isMobileLayout)`
- `looksLikeShellTranscript(body)`

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatDebugMode.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/app/sessions/[sessionId]/chatDebugMode.ts services/aris-web/tests/chatDebugMode.test.ts
git commit -m "feat(chat): add debug mode helper"
```

### Task 2: ChatInterface UI wiring and debug renderer

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css`

- [ ] **Step 1: Write the failing test**

Add or update a light integration-style test if needed for the new render branch, otherwise rely on the helper test and keep this task focused on implementation.

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatRuntime.test.ts tests/chatDebugMode.test.ts`
Expected: the new UI branch is still absent.

- [ ] **Step 3: Write minimal implementation**

Implement:
- local component state for debug mode
- a `ResizeObserver`-based header width measurement
- a header button when space is sufficient
- a context menu item when space is not sufficient
- debug rendering that swaps agent action cards for raw-body rendering
- transcript-aware bash highlighting using the existing syntax highlighter

- [ ] **Step 4: Run test to verify it passes**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatDebugMode.test.ts tests/chatRuntime.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css
git commit -m "feat(chat): add debug mode toggle"
```

### Task 3: Final verification

**Files:**
- Modify: none

- [ ] **Step 1: Run focused test suite**

Run: `cd services/aris-web && ./node_modules/.bin/vitest run tests/chatDebugMode.test.ts tests/chatRuntime.test.ts tests/chatSelection.test.ts tests/sessionEvents.test.ts`

- [ ] **Step 2: Run lint**

Run: `cd services/aris-web && npm run lint`

- [ ] **Step 3: Commit any cleanup**

If lint forces small follow-up fixes, commit them separately with a focused message.
