# Session Scroll Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 모바일 채팅 resume/tail-restore/load-older 충돌을 먼저 핫픽스로 차단하고, 이어서 세션 화면 전체의 스크롤 소유권을 phase 기반으로 통합한다.

**Architecture:** 1단계에서는 `ChatInterface` 내부에 resume-safe gate를 추가해 시스템성 scroll/reflow 이벤트가 `loadOlderHistory()`와 auto-scroll을 자극하지 못하게 한다. 2단계에서는 session screen 공통 `scroll phase` 계층을 도입해 chat tail restore, older history loading, header/bottom-nav auto-hide, viewport reflow가 동일한 phase 정책을 공유하게 한다.

**Tech Stack:** Next.js App Router, React hooks, TypeScript, Vitest, Playwright

---

### Task 1: Capture The Regression In Tests

**Files:**
- Modify: `services/aris-web/tests/chatScroll.test.ts`
- Modify: `services/aris-web/tests/chatTailRestoreActions.test.ts`

- [ ] **Step 1: Write the failing test**

Add a unit-level regression test proving that resume/reflow state blocks `loadOlderHistory()` style triggers until the baseline is re-synced.

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- --run tests/chatScroll.test.ts tests/chatTailRestoreActions.test.ts`
Expected: FAIL because current helpers do not model resume-safe blocking.

- [ ] **Step 3: Write minimal implementation**

Add pure helper(s) in `chatScroll.ts` for resume guard state / phase gating without touching unrelated behavior.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- --run tests/chatScroll.test.ts tests/chatTailRestoreActions.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/app/sessions/[sessionId]/chatScroll.ts services/aris-web/tests/chatScroll.test.ts services/aris-web/tests/chatTailRestoreActions.test.ts
git commit -m "test: cover chat resume scroll regression"
```

### Task 2: Ship The Resume Hotfix

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/chatScroll.ts`
- Test: `services/aris-web/tests/chatScroll.test.ts`
- Test: `services/aris-web/tests/chatTailRestoreActions.test.ts`
- Test: `services/aris-web/tests/chatScrollRestoreAnchor.test.ts`

- [ ] **Step 1: Extend the failing test if needed**

Add a component-level regression assertion covering `focus/pageshow/visibilitychange` driven resume behavior.

- [ ] **Step 2: Run the targeted tests and watch the failure**

Run: `npm test -- --run tests/chatScroll.test.ts tests/chatTailRestoreActions.test.ts tests/chatScrollRestoreAnchor.test.ts`
Expected: FAIL on the new resume regression.

- [ ] **Step 3: Implement the minimal hotfix**

Introduce a chat-level resume guard and use it to block `loadOlderHistory()`, older-history scroll triggers, and stale auto-scroll decisions until the scroll baseline is re-established.

- [ ] **Step 4: Verify the hotfix**

Run: `npm test -- --run tests/chatScroll.test.ts tests/chatTailRestoreActions.test.ts tests/chatScrollRestoreAnchor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx services/aris-web/app/sessions/[sessionId]/chatScroll.ts services/aris-web/tests/chatScroll.test.ts services/aris-web/tests/chatTailRestoreActions.test.ts services/aris-web/tests/chatScrollRestoreAnchor.test.ts
git commit -m "fix: guard chat scroll on resume"
```

### Task 3: Verify And Deploy The Hotfix

**Files:**
- Verify only

- [ ] **Step 1: Run required regression tests**

Run: `npm test -- --run tests/chatScroll.test.ts tests/chatTailRestoreActions.test.ts tests/chatScrollRestoreAnchor.test.ts tests/mobileOverflowLayout.test.ts`
Expected: PASS

- [ ] **Step 2: Run mobile overflow E2E**

Run: `MOBILE_OVERFLOW_BASE_URL=http://127.0.0.1:<port> npm run test:e2e:mobile-overflow`
Expected: PASS

- [ ] **Step 3: Merge and deploy via official script**

Follow `deploy/README.md`, push the hotfix branch, merge to `main`, then deploy with `./deploy/deploy_web.sh`.

- [ ] **Step 4: Verify production**

Check localhost/login, public login, backend health, and relevant runtime logs.

- [ ] **Step 5: Commit/merge bookkeeping**

Keep the hotfix commit history clean and prepare the follow-up architecture branch from updated `main`.

### Task 4: Introduce Scroll Phase Orchestrator

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/useSessionScrollOrchestrator.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/useChatTailRestore.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/chatScroll.ts`

- [ ] **Step 1: Write the failing tests**

Add pure tests for phase transitions: `idle -> resuming`, `resuming -> restoring-tail`, `restoring-tail -> idle`, `user-scrolling -> loading-older`.

- [ ] **Step 2: Run them to watch failure**

Run: `npm test -- --run tests/chatScroll.test.ts`
Expected: FAIL because no orchestrator/phase reducer exists.

- [ ] **Step 3: Implement the orchestrator minimally**

Create a focused hook/reducer that owns phase transitions and exposes gating helpers to chat resume, tail restore, load older, and user scroll consumers.

- [ ] **Step 4: Verify tests pass**

Run: `npm test -- --run tests/chatScroll.test.ts tests/chatTailRestoreActions.test.ts tests/chatScrollRestoreAnchor.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/app/sessions/[sessionId]/useSessionScrollOrchestrator.ts services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx services/aris-web/app/sessions/[sessionId]/useChatTailRestore.ts services/aris-web/app/sessions/[sessionId]/chatScroll.ts services/aris-web/tests/chatScroll.test.ts services/aris-web/tests/chatTailRestoreActions.test.ts services/aris-web/tests/chatScrollRestoreAnchor.test.ts
git commit -m "refactor: centralize session scroll phases"
```

### Task 5: Move Layout Listeners Onto The Shared Phase Model

**Files:**
- Modify: `services/aris-web/components/layout/Header.tsx`
- Modify: `services/aris-web/components/layout/BottomNav.tsx`
- Modify: `services/aris-web/components/layout/ViewportHeightSync.tsx`
- Modify: `services/aris-web/components/layout/mobileScrollAutoHide.ts`
- Test: `services/aris-web/tests/mobileScrollAutoHide.test.ts`

- [ ] **Step 1: Write the failing tests**

Add tests proving auto-hide and viewport sync ignore resume/reflow phases and react only during `user-scrolling`.

- [ ] **Step 2: Run them to watch failure**

Run: `npm test -- --run tests/mobileScrollAutoHide.test.ts`
Expected: FAIL because listeners still react directly to raw events.

- [ ] **Step 3: Implement the minimal integration**

Route layout-level resume/viewport listeners through orchestrator state instead of direct stale delta interpretation.

- [ ] **Step 4: Verify tests pass**

Run: `npm test -- --run tests/mobileScrollAutoHide.test.ts tests/mobileOverflowLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/components/layout/Header.tsx services/aris-web/components/layout/BottomNav.tsx services/aris-web/components/layout/ViewportHeightSync.tsx services/aris-web/components/layout/mobileScrollAutoHide.ts services/aris-web/tests/mobileScrollAutoHide.test.ts services/aris-web/tests/mobileOverflowLayout.test.ts
git commit -m "refactor: align layout scroll listeners with session phases"
```

### Task 6: Final Verification, Merge, Deploy, Cleanup

**Files:**
- Verify only

- [ ] **Step 1: Run the full targeted suite**

Run: `npm test -- --run tests/chatScroll.test.ts tests/chatTailRestoreActions.test.ts tests/chatScrollRestoreAnchor.test.ts tests/mobileScrollAutoHide.test.ts tests/mobileOverflowLayout.test.ts`
Expected: PASS

- [ ] **Step 2: Run mobile overflow E2E against the updated branch**

Run: `MOBILE_OVERFLOW_BASE_URL=http://127.0.0.1:<port> npm run test:e2e:mobile-overflow`
Expected: PASS

- [ ] **Step 3: Merge to main and deploy**

Use a merge worktree, push `main`, run `./deploy/deploy_web.sh`, and verify blue/green health.

- [ ] **Step 4: Confirm production behavior**

Check deployed login pages, backend health, and logs for scroll-related regressions.

- [ ] **Step 5: Cleanup**

Remove the worktrees and delete the local/remote branches after `main` is updated.
