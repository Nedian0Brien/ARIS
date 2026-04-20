# Recharts SSR Warning Fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stop the repeated Recharts `width(-1) and height(-1)` warning by preventing responsive charts from rendering during SSR and unstable first paint.

**Architecture:** Add a small client-only responsive chart wrapper that renders a sized placeholder during SSR/initial mount, then swaps to `ResponsiveContainer` after the component mounts in the browser. Apply the wrapper to the `SessionDashboard` donut charts so the production dashboard keeps its layout while avoiding server-side Recharts measurement warnings.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Recharts, Vitest

---

### Task 1: Lock the Regression With Tests

**Files:**
- Create: `services/aris-web/tests/deferredResponsiveContainer.test.ts`
- Test: `services/aris-web/tests/mobileOverflowLayout.test.ts`

- [x] **Step 1: Write the failing SSR test**

Assert that server-rendering the new chart wrapper does not emit the known Recharts warning and still returns a placeholder shell with explicit sizing.

- [x] **Step 2: Run the targeted test to verify it fails**

Run: `node_modules/.bin/vitest run tests/deferredResponsiveContainer.test.ts`

Expected: FAIL because the wrapper does not exist yet.

### Task 2: Add the Client-Only Chart Wrapper

**Files:**
- Create: `services/aris-web/components/charts/DeferredResponsiveContainer.tsx`

- [x] **Step 1: Implement the minimal wrapper**

Render a fallback `div` with `width: 100%`, the provided height/minHeight, and `min-width: 0` until `useEffect` confirms the component mounted.

- [x] **Step 2: Swap to `ResponsiveContainer` after mount**

Pass through the child chart tree unchanged once the browser mount happens.

### Task 3: Apply the Wrapper to SessionDashboard

**Files:**
- Modify: `services/aris-web/app/SessionDashboard.tsx`

- [x] **Step 1: Replace each dashboard `ResponsiveContainer` with the deferred wrapper**

Update the CPU, RAM, and agent distribution donut charts.

- [x] **Step 2: Keep sizing behavior unchanged**

Preserve the same `width="100%"` and `height="100%"` semantics so the visual layout stays stable.

### Task 4: Verify the Fix

**Files:**
- Test: `services/aris-web/tests/deferredResponsiveContainer.test.ts`
- Test: `services/aris-web/tests/mobileOverflowLayout.test.ts`

- [x] **Step 1: Run targeted chart regression tests**

Run: `node_modules/.bin/vitest run tests/deferredResponsiveContainer.test.ts`

- [x] **Step 2: Run related overflow/layout tests**

Run: `node_modules/.bin/vitest run tests/mobileOverflowLayout.test.ts`

- [x] **Step 3: Run typecheck**

Run: `node_modules/.bin/tsc --noEmit`

- [x] **Step 4: Run mobile overflow e2e**

Run: `node_modules/.bin/playwright test tests/e2e/mobile-overflow.spec.ts`

Expected: pass if `MOBILE_OVERFLOW_EMAIL` and `MOBILE_OVERFLOW_PASSWORD` are configured, otherwise document the env blocker.

### Task 5: Finalize the Branch

**Files:**
- Modify: `docs/superpowers/plans/2026-04-18-recharts-ssr-warning-fix.md`

- [x] **Step 1: Mark the plan complete if implementation matches**
- [ ] **Step 2: Commit with a focused message**
- [ ] **Step 3: Push `codex/fix-recharts-warning`**
