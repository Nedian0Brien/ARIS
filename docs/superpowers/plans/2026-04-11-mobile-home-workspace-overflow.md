# Mobile Home Workspace Overflow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove mobile horizontal overflow from the home dashboard and workspace home screens by making their layout rules viewport-safe.

**Architecture:** Keep the existing page structure and fix the regression at the CSS-module layer. Guard the fix with source-level regression tests that assert mobile breakpoints use single-column or `minmax(0, 1fr)`-safe layouts instead of rigid widths.

**Tech Stack:** Next.js App Router, React 19, CSS Modules, Vitest

---

### Task 1: Add regression tests for mobile overflow rules

**Files:**
- Create: `services/aris-web/tests/mobileOverflowLayout.test.ts`
- Test: `services/aris-web/tests/mobileOverflowLayout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('uses a viewport-safe single-column dashboard layout below tablet widths', () => {
  expect(css).toMatch(/.../);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- mobileOverflowLayout.test.ts`
Expected: FAIL because the current CSS still locks the workspace stats row to 3 columns on mobile and does not document the stronger mobile-safe dashboard constraints.

- [ ] **Step 3: Write minimal implementation**

Update the relevant CSS module breakpoints so mobile widths collapse safely without changing desktop layouts.

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- mobileOverflowLayout.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/aris-web/tests/mobileOverflowLayout.test.ts services/aris-web/app/SessionDashboard.module.css services/aris-web/app/sessions/[sessionId]/WorkspaceHome.module.css docs/superpowers/plans/2026-04-11-mobile-home-workspace-overflow.md
git commit -m "fix: prevent mobile overflow on home screens"
```

### Task 2: Verify affected responsive layouts

**Files:**
- Modify: `services/aris-web/app/SessionDashboard.module.css`
- Modify: `services/aris-web/app/sessions/[sessionId]/WorkspaceHome.module.css`
- Test: `services/aris-web/tests/mobileOverflowLayout.test.ts`

- [ ] **Step 1: Run targeted tests**

Run: `npm test -- mobileOverflowLayout.test.ts linkPreviewCarouselLayout.test.ts`
Expected: PASS

- [ ] **Step 2: Run broader web verification**

Run: `npm test`
Expected: PASS or, if unrelated failures already exist, capture them explicitly before commit.

- [ ] **Step 3: Commit and push**

```bash
git add docs/superpowers/plans/2026-04-11-mobile-home-workspace-overflow.md services/aris-web/tests/mobileOverflowLayout.test.ts services/aris-web/app/SessionDashboard.module.css services/aris-web/app/sessions/[sessionId]/WorkspaceHome.module.css
git commit -m "fix: prevent mobile overflow on home screens"
git push -u origin fix/mobile-overflow-home-workspace
```
