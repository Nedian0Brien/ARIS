# Chat File Badge Links Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Render local file references in chat bubbles as file badges and open them in the workspace editor instead of broken browser hyperlinks.

**Architecture:** Extend the existing chat markdown/plain-text rendering path in `ChatInterface.tsx` so it classifies local file references before creating anchor tags. Reuse the current `ResourceChip` and `dispatchWorkspaceFileOpen()` flow so the right sidebar file editor and markdown preview behavior stay unchanged.

**Tech Stack:** Next.js, React, TypeScript, Vitest, existing workspace file editor/sidebar UI

---

### Task 1: Lock Failing Cases In Tests

**Files:**
- Modify: `services/aris-web/tests/chatSelection.test.ts` or a new focused chat rendering test file
- Test: `services/aris-web/tests/<new test file>`

- [ ] **Step 1: Write the failing test**

Add focused tests for:
- markdown local links with `:line`
- markdown local links with angle brackets
- plain text local paths
- external URLs staying as links

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/aris-web && npm test -- --run <new test file>`
Expected: FAIL because current parser falls back to `<a>` for local file references with line suffixes/plain text.

### Task 2: Implement Local File Reference Classification

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Test: `services/aris-web/tests/<new test file>`

- [ ] **Step 1: Add parsing helpers**

Add helpers that:
- strip angle brackets
- split line suffixes from local paths
- distinguish local paths from external URLs
- normalize resource labels for badge rendering

- [ ] **Step 2: Add minimal rendering changes**

Update markdown and plain-text rendering so local file references produce `InlineResourceChip` and call `dispatchWorkspaceFileOpen()` on click.

- [ ] **Step 3: Run focused tests**

Run: `cd services/aris-web && npm test -- --run <new test file>`
Expected: PASS

### Task 3: Verify No Regression In Existing File/Chat UI

**Files:**
- Reuse existing chat and workspace tests

- [ ] **Step 1: Run related regression tests**

Run:
- `cd services/aris-web && npm test -- --run tests/chatCommands.test.ts`
- `cd services/aris-web && npm test -- --run tests/workspacePathCopy.test.ts`

- [ ] **Step 2: Commit**

```bash
git add docs/superpowers/specs/2026-04-11-chat-file-badge-design.md \
        docs/superpowers/plans/2026-04-11-chat-file-badge-links.md \
        services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx \
        services/aris-web/tests/<new test file>
git commit -m "fix: render chat file references as badges"
```
