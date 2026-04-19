# Chat History Windowing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 긴 채팅에서 최근 N페이지 윈도우만 유지하고, `맨 아래로 이동` 버튼이 최신 페이지 복귀 후 tail 이동을 수행하게 만든다.

**Architecture:** 이벤트 로딩 책임은 `useSessionEvents` 가 유지하되, 로드된 페이지 윈도우 bookkeeping 과 latest reset action 을 추가한다. UI 계층은 `useChatTailRestore` 와 `ChatInterface` 에서 이 새 action 을 연결하고, 기존 tail restore 흐름 위에 최신 페이지 reset semantics 만 덧씌운다.

**Tech Stack:** React, Next.js App Router, custom hooks, Vitest, Testing Library

---

### Task 1: Add failing tests for history window trimming

**Files:**
- Modify: `services/aris-web/tests/useSessionEvents.test.tsx` or nearest existing session-events hook test file
- Modify: `services/aris-web/lib/hooks/useSessionEvents.ts`

- [ ] **Step 1: Write the failing test**

테스트 시나리오:
- 최신 1페이지 hydrate
- `loadOlder()` 를 3회 이상 호출
- `MAX_LOADED_EVENT_PAGES` 초과 시 가장 오래된 페이지가 제거됨

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm --filter aris-web test -- --runInBand useSessionEvents`

- [ ] **Step 3: Write minimal implementation**

`useSessionEvents.ts` 에:
- `MAX_LOADED_EVENT_PAGES` 상수
- loaded page count 계산
- loadOlder 성공 후 oldest page trim helper

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm --filter aris-web test -- --runInBand useSessionEvents`

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/lib/hooks/useSessionEvents.ts services/aris-web/tests/useSessionEvents.test.tsx
git commit -m "test: cover chat history page window trimming"
```

### Task 2: Add failing tests for reset-to-latest behavior

**Files:**
- Modify: `services/aris-web/tests/useSessionEvents.test.tsx`
- Modify: `services/aris-web/lib/hooks/useSessionEvents.ts`

- [ ] **Step 1: Write the failing test**

테스트 시나리오:
- 과거 페이지 여러 개 로드
- `resetToLatestWindow()` 호출
- 최신 1페이지와 최신 page metadata 로 상태가 치환됨

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm --filter aris-web test -- --runInBand useSessionEvents`

- [ ] **Step 3: Write minimal implementation**

`useSessionEvents.ts` 에:
- `resetToLatestWindow()`
- `isResettingToLatest`
- stale response guard

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm --filter aris-web test -- --runInBand useSessionEvents`

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/lib/hooks/useSessionEvents.ts services/aris-web/tests/useSessionEvents.test.tsx
git commit -m "feat: add latest-page reset action for chat history"
```

### Task 3: Rewire jump-to-bottom semantics with tests first

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/useChatTailRestore.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/tests/useChatTailRestore.test.tsx` or nearest tail-restore test file

- [ ] **Step 1: Write the failing test**

테스트 시나리오:
- `handleJumpToBottom()` 호출
- `resetToLatestWindow()` 이 먼저 호출됨
- 이후 `restoreConversationToTail()` 또는 equivalent scroll path 실행

- [ ] **Step 2: Run test to verify it fails**

Run: `rtk pnpm --filter aris-web test -- --runInBand useChatTailRestore`

- [ ] **Step 3: Write minimal implementation**

`useChatTailRestore.ts` 와 `ChatInterface.tsx` 에:
- reset action injection
- async jump handler
- 중복 호출 guard

- [ ] **Step 4: Run test to verify it passes**

Run: `rtk pnpm --filter aris-web test -- --runInBand useChatTailRestore`

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/app/sessions/[sessionId]/useChatTailRestore.ts services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx services/aris-web/tests/useChatTailRestore.test.tsx
git commit -m "feat: make jump-to-bottom restore latest chat page"
```

### Task 4: Run focused regressions

**Files:**
- Verify only

- [ ] **Step 1: Run session event and tail restore tests**

Run: `rtk pnpm --filter aris-web test -- --runInBand useSessionEvents useChatTailRestore`

- [ ] **Step 2: Run mobile overflow regression tests**

Run: `rtk pnpm --filter aris-web test -- --runInBand services/aris-web/tests/mobileOverflowLayout.test.ts`

Run: `rtk pnpm --filter aris-web exec playwright test tests/e2e/mobile-overflow.spec.ts`

- [ ] **Step 3: Run any additional chat-focused test impacted by the hook changes**

Run: `rtk pnpm --filter aris-web test -- --runInBand chatScroll`

- [ ] **Step 4: Commit final verification-safe state**

```bash
git add -A
git commit -m "feat: window chat history and reset latest-page jump"
```
