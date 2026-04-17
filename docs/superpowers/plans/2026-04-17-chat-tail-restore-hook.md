# useChatTailRestore Hook Extraction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract tail-restore/scroll logic from ChatInterface.tsx into `useChatTailRestore.ts`, fixing scroll precision (Bug1) and spurious loadOlder during settle (Bug2).

**Architecture:** New custom hook owns all state/refs/effects related to tail-restore settle loop and scroll-to-bottom; ChatInterface imports the hook and adds three `isTailLayoutSettlingRef` guards for Bug2.

**Tech Stack:** React 18, TypeScript, vitest (node env), Next.js 14

---

## File Map

| Action | Path | Responsibility |
|--------|------|---------------|
| Create | `services/aris-web/app/sessions/[sessionId]/useChatTailRestore.ts` | Hook: settle loop, scroll fns, state/refs |
| Modify | `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx` | Remove extracted code, add hook call + 3 guards |
| Modify | `services/aris-web/tests/chatScroll.test.ts` | Add edge-case coverage for helpers used in fix |

**Worktree:** `/home/ubuntu/project/ARIS-fix-chat-tail-precise`
**Branch:** `codex/fix-chat-tail-precise`
**Spec:** `docs/superpowers/specs/2026-04-17-chat-tail-restore-hook-design.md`

---

## Testing Strategy Note

The vitest config uses `environment: 'node'` and neither jsdom nor @testing-library/react is installed. React hook internals (state transitions, effects) cannot be unit-tested in this environment. The plan therefore:
1. **TDD the pure logic** — Extract `shouldBlockLoadOlder` (Bug2 guard) as a pure helper function to `chatScroll.ts` and test it before implementing the hook.
2. **Compile-time verification** — TypeScript `tsc --noEmit` catches incorrect hook interface usage.
3. **Runtime verification** — Manual browser checklist after deploy.

---

## Task 1: Verify baseline — existing tests pass on branch

**Files:** (read-only)

- [ ] **Step 1: Run chatScroll tests to establish baseline**

```bash
cd /home/ubuntu/project/ARIS-fix-chat-tail-precise
npx --prefix services/aris-web vitest run tests/chatScroll.test.ts tests/chatScrollRestoreAnchor.test.ts 2>&1 | tail -10
```

Expected: all tests pass (no failures in these two files)

---

## Task 2: TDD — Add shouldBlockLoadOlder to chatScroll.ts (Bug2 guard pure function)

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/chatScroll.ts`
- Modify: `services/aris-web/tests/chatScroll.test.ts`

- [ ] **Step 1: Write the failing test first**

In `services/aris-web/tests/chatScroll.test.ts`, import `shouldBlockLoadOlder` (not yet exported) and add:

```ts
import {
  // ...existing imports...
  shouldBlockLoadOlder,
} from '@/app/sessions/[sessionId]/chatScroll';

// ...existing tests...

describe('shouldBlockLoadOlder', () => {
  it('blocks when tail is settling', () => {
    expect(shouldBlockLoadOlder({ isTailLayoutSettling: true, isLoadingOlder: false, hasMoreBefore: true })).toBe(true);
  });
  it('blocks when already loading older', () => {
    expect(shouldBlockLoadOlder({ isTailLayoutSettling: false, isLoadingOlder: true, hasMoreBefore: true })).toBe(true);
  });
  it('blocks when no more before', () => {
    expect(shouldBlockLoadOlder({ isTailLayoutSettling: false, isLoadingOlder: false, hasMoreBefore: false })).toBe(true);
  });
  it('allows when all conditions clear', () => {
    expect(shouldBlockLoadOlder({ isTailLayoutSettling: false, isLoadingOlder: false, hasMoreBefore: true })).toBe(false);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

```bash
cd /home/ubuntu/project/ARIS-fix-chat-tail-precise
npx --prefix services/aris-web vitest run tests/chatScroll.test.ts 2>&1 | tail -10
```

Expected: FAIL — `shouldBlockLoadOlder is not a function`

- [ ] **Step 3: Add the pure function to chatScroll.ts**

At the end of `services/aris-web/app/sessions/[sessionId]/chatScroll.ts`, add:

```ts
type ShouldBlockLoadOlderInput = {
  isTailLayoutSettling: boolean;
  isLoadingOlder: boolean;
  hasMoreBefore: boolean;
};

export function shouldBlockLoadOlder(input: ShouldBlockLoadOlderInput): boolean {
  return input.isTailLayoutSettling || input.isLoadingOlder || !input.hasMoreBefore;
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd /home/ubuntu/project/ARIS-fix-chat-tail-precise
npx --prefix services/aris-web vitest run tests/chatScroll.test.ts 2>&1 | tail -10
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
cd /home/ubuntu/project/ARIS-fix-chat-tail-precise
git add services/aris-web/app/sessions/\[sessionId\]/chatScroll.ts services/aris-web/tests/chatScroll.test.ts
git commit -m "feat: add shouldBlockLoadOlder pure helper with tests"
```

---

## Task 2b: Add edge-case tests for resolveMobileWindowScrollTop (Bug1 helper)

The `complete()` function in the hook uses `resolveMobileWindowScrollTop` to compute the pixel-perfect mobile offset. Extend its tests to cover zero-clamping.

**Files:**
- Modify: `services/aris-web/tests/chatScroll.test.ts`

- [ ] **Step 1: Add failing tests for edge cases**

Open `services/aris-web/tests/chatScroll.test.ts`. After the existing `resolveMobileWindowScrollTop` test, add:

```ts
it('clamps mobile pixel-perfect scroll top to zero when viewport exceeds document', () => {
  expect(resolveMobileWindowScrollTop({ scrollHeight: 500, viewportHeight: 800 })).toBe(0);
  expect(resolveMobileWindowScrollTop({ scrollHeight: 0, viewportHeight: 0 })).toBe(0);
  expect(resolveMobileWindowScrollTop({ scrollHeight: 1000, viewportHeight: 1000 })).toBe(0);
  expect(resolveMobileWindowScrollTop({ scrollHeight: 1001, viewportHeight: 1000 })).toBe(1);
});
```

- [ ] **Step 2: Run to confirm they pass** (these should pass immediately — they're documenting existing behavior)

```bash
cd /home/ubuntu/project/ARIS-fix-chat-tail-precise
npx --prefix services/aris-web vitest run tests/chatScroll.test.ts 2>&1 | tail -10
```

Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
cd /home/ubuntu/project/ARIS-fix-chat-tail-precise
git add services/aris-web/tests/chatScroll.test.ts
git commit -m "test: extend resolveMobileWindowScrollTop edge cases"
```

---

## Task 3: Create useChatTailRestore.ts

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/useChatTailRestore.ts`

- [ ] **Step 1: Create the hook file**

```bash
touch /home/ubuntu/project/ARIS-fix-chat-tail-precise/services/aris-web/app/sessions/\[sessionId\]/useChatTailRestore.ts
```

- [ ] **Step 2: Write the hook**

Write the following to `services/aris-web/app/sessions/[sessionId]/useChatTailRestore.ts`:

```ts
'use client';

import {
  type Dispatch,
  type MutableRefObject,
  type RefObject,
  type SetStateAction,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  hasTailLayoutSettled,
  isNearBottom,
  isNearWindowBottom,
  resolveMobileWindowScrollTop,
  resolveScrollToBottomTarget,
  resolveTailScrollAnchorId,
  shouldRestoreTailScrollOnChatEntry,
} from './chatScroll';

const TAIL_LAYOUT_SETTLE_TIMEOUT_MS = 1200;

export type UseChatTailRestoreInput = {
  activeChatIdResolved: string | null;
  /**
   * Chat ID of events currently loaded. When it differs from activeChatIdResolved
   * (transient during chat switch), tail restore is suppressed until they match.
   */
  eventsForChatId: string | null;  // null while no events loaded yet
  hasLoadedCurrentChat: boolean;
  isTailRestoreHydrated: boolean;
  isNewChatPlaceholder: boolean;
  isWorkspaceHome: boolean;
  isMobileLayout: boolean;
  initialShowChatEntryLoading: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  latestVisibleEventIdRef: RefObject<string | null>;
};

export type UseChatTailRestoreOutput = {
  isTailLayoutSettling: boolean;
  /**
   * Ref mirror of isTailLayoutSettling. Use this (not the state value) inside
   * event listener closures and useCallback to avoid stale captures.
   */
  isTailLayoutSettlingRef: MutableRefObject<boolean>;
  isInitialChatEntryPendingReveal: boolean;
  shouldStickToBottomRef: MutableRefObject<boolean>;
  showScrollToBottom: boolean;
  setShowScrollToBottom: Dispatch<SetStateAction<boolean>>;
  scrollConversationToBottom: (behavior?: ScrollBehavior) => void;
  restoreConversationToTail: (behavior?: ScrollBehavior) => void;
  syncScrollToBottomButton: () => void;
  handleJumpToBottom: () => void;
};

export function useChatTailRestore({
  activeChatIdResolved,
  eventsForChatId,
  hasLoadedCurrentChat,
  isTailRestoreHydrated,
  isNewChatPlaceholder,
  isWorkspaceHome,
  isMobileLayout,
  initialShowChatEntryLoading,
  scrollRef,
  latestVisibleEventIdRef,
}: UseChatTailRestoreInput): UseChatTailRestoreOutput {
  const [isInitialChatEntryPendingReveal, setIsInitialChatEntryPendingReveal] = useState(initialShowChatEntryLoading);
  const [isTailLayoutSettling, setIsTailLayoutSettling] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const restoredTailScrollForChatRef = useRef<string | null>(null);
  const tailRestoreCancelRef = useRef<(() => void) | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const isTailLayoutSettlingRef = useRef(false);

  const scrollConversationToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const target = resolveScrollToBottomTarget({
      isMobileLayout,
      keyboardOpen: document.documentElement.dataset.keyboardOpen === 'true',
    });
    if (target === 'window') {
      const top = resolveMobileWindowScrollTop({
        scrollHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      });
      window.scrollTo({ top, behavior });
      return;
    }
    const stream = scrollRef.current;
    if (!stream) {
      return;
    }
    // scrollHeight - clientHeight = maximum valid scrollTop; browsers clamp but we're explicit
    stream.scrollTo({ top: stream.scrollHeight - stream.clientHeight, behavior });
  }, [isMobileLayout, scrollRef]);

  const restoreConversationToTail = useCallback((behavior: ScrollBehavior = 'auto') => {
    const anchorId = resolveTailScrollAnchorId({
      latestVisibleEventId: latestVisibleEventIdRef.current,
    });
    if (anchorId) {
      const anchor = document.getElementById(anchorId);
      if (anchor) {
        anchor.scrollIntoView({ behavior, block: 'end' });
        return;
      }
    }
    scrollConversationToBottom(behavior);
  }, [latestVisibleEventIdRef, scrollConversationToBottom]);

  const readTailLayoutMetrics = useCallback(() => {
    const anchorId = resolveTailScrollAnchorId({
      latestVisibleEventId: latestVisibleEventIdRef.current,
    });
    const anchor = anchorId ? document.getElementById(anchorId) : null;
    return {
      anchorBottom: anchor ? anchor.getBoundingClientRect().bottom : null,
      scrollHeight: isMobileLayout
        ? Math.max(document.documentElement.scrollHeight, document.body.scrollHeight)
        : (scrollRef.current?.scrollHeight ?? null),
    };
  }, [isMobileLayout, latestVisibleEventIdRef, scrollRef]);

  const syncScrollToBottomButton = useCallback(() => {
    if (isMobileLayout) {
      setShowScrollToBottom(!isNearWindowBottom());
      return;
    }
    const stream = scrollRef.current;
    if (!stream) {
      setShowScrollToBottom(false);
      return;
    }
    setShowScrollToBottom(!isNearBottom(stream));
  }, [isMobileLayout, scrollRef]);

  const handleJumpToBottom = useCallback(() => {
    shouldStickToBottomRef.current = true;
    setShowScrollToBottom(false);
    scrollConversationToBottom('smooth');
  }, [scrollConversationToBottom]);

  // Reset when navigating away from an active chat
  useEffect(() => {
    if (isWorkspaceHome || isNewChatPlaceholder || !activeChatIdResolved) {
      if (tailRestoreCancelRef.current) {
        tailRestoreCancelRef.current();
        tailRestoreCancelRef.current = null;
      }
      restoredTailScrollForChatRef.current = null;
      setIsInitialChatEntryPendingReveal(false);
      isTailLayoutSettlingRef.current = false;
      setIsTailLayoutSettling(false);
    }
  }, [activeChatIdResolved, isNewChatPlaceholder, isWorkspaceHome]);

  // Tail-restore settle loop
  useEffect(() => {
    if (!shouldRestoreTailScrollOnChatEntry({
      activeChatId: activeChatIdResolved,
      eventsForChatId,
      hasLoadedCurrentChat,
      isTailRestoreHydrated,
      isWorkspaceHome,
      isNewChatPlaceholder,
      restoredForChatId: restoredTailScrollForChatRef.current,
    })) {
      return;
    }

    if (tailRestoreCancelRef.current) {
      tailRestoreCancelRef.current();
      tailRestoreCancelRef.current = null;
    }

    restoredTailScrollForChatRef.current = activeChatIdResolved;
    shouldStickToBottomRef.current = true;
    setShowScrollToBottom(false);
    isTailLayoutSettlingRef.current = true;
    setIsTailLayoutSettling(true);

    let finished = false;
    let rafId = 0;
    let timeoutId = 0;
    let stableFrameCount = 0;
    let previousMetrics: ReturnType<typeof readTailLayoutMetrics> | null = null;

    const complete = () => {
      if (finished) {
        return;
      }
      finished = true;
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
      if (tailRestoreCancelRef.current === complete) {
        tailRestoreCancelRef.current = null;
      }
      // Bug1 fix: force pixel-perfect alignment after anchor-based settle
      if (isMobileLayout) {
        const scrollHeight = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight);
        const viewportHeight = window.visualViewport?.height ?? window.innerHeight;
        window.scrollTo({ top: Math.max(0, scrollHeight - viewportHeight), behavior: 'auto' });
      } else {
        const stream = scrollRef.current;
        if (stream) {
          stream.scrollTop = stream.scrollHeight - stream.clientHeight;
        }
      }
      setIsInitialChatEntryPendingReveal(false);
      isTailLayoutSettlingRef.current = false;
      setIsTailLayoutSettling(false);
    };

    const settle = () => {
      if (finished) {
        return;
      }
      if (shouldStickToBottomRef.current) {
        restoreConversationToTail('auto');
      }
      const nextMetrics = readTailLayoutMetrics();
      if (previousMetrics && hasTailLayoutSettled({
        previousAnchorBottom: previousMetrics.anchorBottom,
        nextAnchorBottom: nextMetrics.anchorBottom,
        previousScrollHeight: previousMetrics.scrollHeight,
        nextScrollHeight: nextMetrics.scrollHeight,
      })) {
        stableFrameCount += 1;
      } else {
        stableFrameCount = 0;
      }
      previousMetrics = nextMetrics;
      if (stableFrameCount >= 2) {
        complete();
        return;
      }
      rafId = window.requestAnimationFrame(settle);
    };

    tailRestoreCancelRef.current = complete;
    settle();
    timeoutId = window.setTimeout(complete, TAIL_LAYOUT_SETTLE_TIMEOUT_MS);
  }, [
    activeChatIdResolved,
    eventsForChatId,
    hasLoadedCurrentChat,
    isMobileLayout,
    isTailRestoreHydrated,
    isNewChatPlaceholder,
    isWorkspaceHome,
    readTailLayoutMetrics,
    restoreConversationToTail,
    scrollRef,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (tailRestoreCancelRef.current) {
        tailRestoreCancelRef.current();
        tailRestoreCancelRef.current = null;
      }
    };
  }, []);

  return {
    isTailLayoutSettling,
    isTailLayoutSettlingRef,
    isInitialChatEntryPendingReveal,
    shouldStickToBottomRef,
    showScrollToBottom,
    setShowScrollToBottom,
    scrollConversationToBottom,
    restoreConversationToTail,
    syncScrollToBottomButton,
    handleJumpToBottom,
  };
}
```

- [ ] **Step 3: Verify TypeScript compiles (hook file alone)**

```bash
cd /home/ubuntu/project/ARIS-fix-chat-tail-precise/services/aris-web
npx tsc --noEmit --skipLibCheck 2>&1 | grep "useChatTailRestore" | head -20
```

Expected: no errors mentioning useChatTailRestore.ts (other pre-existing errors in other files are acceptable)

- [ ] **Step 4: Commit**

```bash
cd /home/ubuntu/project/ARIS-fix-chat-tail-precise
git add services/aris-web/app/sessions/\[sessionId\]/useChatTailRestore.ts
git commit -m "feat: extract useChatTailRestore hook with Bug1 pixel-perfect fix"
```

---

## Task 4: Integrate hook into ChatInterface.tsx

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`

### Step 1: Add import

- [ ] At the top of ChatInterface.tsx, find the block of local imports (lines importing from `./chatScroll`). Add:

```ts
import { useChatTailRestore } from './useChatTailRestore';
```

### Step 2: Remove state declarations

- [ ] Delete line 2830 (isInitialChatEntryPendingReveal state):
```
const [isInitialChatEntryPendingReveal, setIsInitialChatEntryPendingReveal] = useState(initialShowChatEntryLoading);
```

- [ ] Delete line 2831 (isTailLayoutSettling state):
```
const [isTailLayoutSettling, setIsTailLayoutSettling] = useState(false);
```

- [ ] Find and delete the showScrollToBottom state declaration (~L2996):
```
const [showScrollToBottom, setShowScrollToBottom] = useState(false);
```

### Step 3: Remove refs that move into the hook

- [ ] Delete line 3058:
```
const restoredTailScrollForChatRef = useRef<string | null>(null);
```

- [ ] Delete line 3059:
```
const tailRestoreCancelRef = useRef<(() => void) | null>(null);
```

- [ ] Delete line 3061:
```
const shouldStickToBottomRef = useRef(true);
```

> ⚠ Keep line 3060 (`latestVisibleEventIdRef`) — it is updated at L3127 and passed as input to the hook.

### Step 4: Add hook call

- [ ] After the remaining refs block (~L3065), add:

```ts
// isTailLayoutSettlingRef: use inside closures/event handlers (avoids stale capture)
// isTailLayoutSettling: use in useCallback deps / JSX
const {
  isTailLayoutSettling,
  isTailLayoutSettlingRef,
  isInitialChatEntryPendingReveal,
  shouldStickToBottomRef,
  showScrollToBottom,
  setShowScrollToBottom,
  scrollConversationToBottom,
  restoreConversationToTail,
  syncScrollToBottomButton,
  handleJumpToBottom,
} = useChatTailRestore({
  activeChatIdResolved,
  eventsForChatId,
  hasLoadedCurrentChat,
  isTailRestoreHydrated,
  isNewChatPlaceholder,
  isWorkspaceHome,
  isMobileLayout,
  initialShowChatEntryLoading,
  scrollRef,
  latestVisibleEventIdRef,
});
```

### Step 5: Remove extracted functions (~L4527–4593)

- [ ] Delete the following function bodies (search by their first line):
  - `const scrollConversationToBottom = useCallback(...)` — ~L4527, entire block including closing `}, [isMobileLayout]);`
  - `const restoreConversationToTail = useCallback(...)` — ~L4548
  - `const readTailLayoutMetrics = useCallback(...)` — ~L4562
  - `const syncScrollToBottomButton = useCallback(...)` — ~L4576
  - `const handleJumpToBottom = useCallback(...)` — ~L4589 (stop before `handleComposerFocus`)

### Step 6: Remove extracted effects (~L4851–4960)

- [ ] Delete the reset effect (starts with `useEffect(() => { if (isWorkspaceHome || isNewChatPlaceholder...`):
  - Lines ~4851–4861

- [ ] Delete the settle loop effect (starts with `useEffect(() => { if (!shouldRestoreTailScrollOnChatEntry...`):
  - Lines ~4863–4951

- [ ] Delete the cleanup effect (starts with `useEffect(() => { return () => { if (tailRestoreCancelRef.current)...`):
  - Lines ~4953–4960

### Step 7: Add Bug2 guards (3 locations)

Also add `shouldBlockLoadOlder` to the existing import from `./chatScroll` at the top of ChatInterface.tsx.

- [ ] **Guard 1 — loadOlderHistory** (~L4448):

Find:
```ts
const loadOlderHistory = useCallback(async () => {
  if (isLoadingOlder || !hasMoreBefore) {
    return;
  }
```

Replace with:
```ts
const loadOlderHistory = useCallback(async () => {
  if (shouldBlockLoadOlder({ isTailLayoutSettling, isLoadingOlder, hasMoreBefore })) {
    return;
  }
```

Add `isTailLayoutSettling` and `shouldBlockLoadOlder` to the `loadOlderHistory` useCallback dependency array.

- [ ] **Guard 2 — mobile scroll handler** (~L4833):

Find inside the mobile window scroll useEffect:
```ts
const onWindowScroll = () => {
  if (isLoadingOlder || !hasMoreBefore) {
    return;
  }
  if (getWindowScrollTop() <= 96) {
    void loadOlderHistory();
  }
};
```

Replace with:
```ts
const onWindowScroll = () => {
  // Use ref (not state) to avoid stale closure capture
  if (shouldBlockLoadOlder({ isTailLayoutSettling: isTailLayoutSettlingRef.current, isLoadingOlder, hasMoreBefore })) {
    return;
  }
  if (getWindowScrollTop() <= 96) {
    void loadOlderHistory();
  }
};
```

- [ ] **Guard 3 — handleStreamScroll** (~L5911):

Find:
```ts
if (!isLoadingOlder && hasMoreBefore && stream.scrollTop <= 96) {
  void loadOlderHistory();
}
```

Replace with:
```ts
// Use ref (not state) to avoid stale closure capture
if (!shouldBlockLoadOlder({ isTailLayoutSettling: isTailLayoutSettlingRef.current, isLoadingOlder, hasMoreBefore }) && stream.scrollTop <= 96) {
  void loadOlderHistory();
}
```

---

## Task 5: TypeScript check

- [ ] **Run full tsc on aris-web**

```bash
cd /home/ubuntu/project/ARIS-fix-chat-tail-precise/services/aris-web
npx tsc --noEmit --skipLibCheck 2>&1 | grep -v "node_modules" | head -40
```

Expected: No new errors compared to baseline. Fix any errors that reference the modified files before continuing.

- [ ] **Run existing scroll tests to confirm no regression**

```bash
cd /home/ubuntu/project/ARIS-fix-chat-tail-precise
npx --prefix services/aris-web vitest run tests/chatScroll.test.ts tests/chatScrollRestoreAnchor.test.ts 2>&1 | tail -10
```

Expected: all pass

---

## Task 6: Commit + deploy

- [ ] **Stage and commit**

```bash
cd /home/ubuntu/project/ARIS-fix-chat-tail-precise
git add services/aris-web/app/sessions/\[sessionId\]/ChatInterface.tsx
git commit -m "refactor: integrate useChatTailRestore + fix loadOlder guard during settle"
```

- [ ] **Merge and deploy via finishing-a-development-branch skill**

Use `superpowers:finishing-a-development-branch` skill. Choose Option 1 (merge to main locally), then run:

```bash
bash /home/ubuntu/project/ARIS/deploy/deploy_web_zero_downtime.sh
```

---

## Manual Verification Checklist (browser)

After deploy, verify in the browser:

- [ ] Open an existing chat → viewport starts at the **last** message, pixel-perfect
- [ ] Refresh an existing chat → same
- [ ] Scroll bar does NOT jump to load older messages during initial load
- [ ] Scroll up manually → older messages load correctly (loadOlder still works)
- [ ] Open a new chat → no tail restore, composer focused, empty state shown
- [ ] Switch between chats → each lands at its own tail
- [ ] Mobile layout → same checks on a mobile viewport
