# Chat File Line Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve `:line` information from chat file badges and navigate the workspace editor or markdown preview to the requested line.

**Architecture:** Extend the existing workspace file open payload with an optional line number and keep the navigation logic inside a focused helper module used by `WorkspaceFileEditor`. Reuse the current file modal flow so the change stays local to chat file open events, sidebar file loading, and editor rendering.

**Tech Stack:** React, TypeScript, Next.js, Vitest, marked, Prism

---

### Task 1: Lock Navigation Helpers With Failing Tests

**Files:**
- Create: `services/aris-web/tests/workspaceFileLineNavigation.test.ts`
- Test: `services/aris-web/tests/workspaceFileLineNavigation.test.ts`

- [ ] **Step 1: Write the failing test**

Add tests for:
- code line selection/clamp
- markdown nearest source-line choice
- markdown preview HTML source-line wrappers

- [ ] **Step 2: Run test to verify it fails**

Run: `cd services/aris-web && npm test -- --run tests/workspaceFileLineNavigation.test.ts`
Expected: FAIL because helper module does not exist yet.

### Task 2: Implement Line Navigation Helpers

**Files:**
- Create: `services/aris-web/components/files/workspaceFileLineNavigation.ts`
- Test: `services/aris-web/tests/workspaceFileLineNavigation.test.ts`

- [ ] **Step 1: Write minimal implementation**

Implement helper functions for:
- code line selection range
- markdown source-line wrapping
- nearest markdown source-line choice

- [ ] **Step 2: Run focused tests**

Run: `cd services/aris-web && npm test -- --run tests/workspaceFileLineNavigation.test.ts`
Expected: PASS

### Task 3: Wire Payload And Editor Navigation

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx`
- Modify: `services/aris-web/components/files/WorkspaceFileEditor.tsx`
- Modify: `services/aris-web/components/files/WorkspaceFileEditor.module.css`

- [ ] **Step 1: Extend file-open payload with line**
- [ ] **Step 2: Apply code editor scroll/highlight**
- [ ] **Step 3: Apply markdown preview scroll/highlight**

- [ ] **Step 4: Run verification**

Run:
- `cd services/aris-web && npm test -- --run tests/workspaceFileLineNavigation.test.ts tests/chatFileReferences.test.ts`
- `cd services/aris-web && ./node_modules/.bin/tsc --noEmit`

Expected: PASS
