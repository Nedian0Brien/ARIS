# Last Passed User Message Top Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show a compact top bar with the most recent user message that has already scrolled above the current viewport boundary, and jump back to it with a temporary highlight.

**Architecture:** Keep the decision logic small and testable by extracting helpers that build user-message jump targets and choose the latest one whose bubble bottom is above the current scroll boundary. Mount a focused center-pane component from `ChatInterface`, compute the passed target from real bubble DOM positions on scroll, and reuse the existing highlighted-event flow for the jump affordance.

**Tech Stack:** Next.js app router, React, TypeScript, CSS modules, Vitest

---

### Task 1: Helper logic and component shell

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/lastUserMessageBar.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/chat-screen/center-pane/LastUserMessageJumpBar.tsx`
- Test: `services/aris-web/tests/lastUserMessageBar.test.ts`

- [ ] **Step 1: Write failing tests**
- [ ] **Step 2: Run targeted Vitest command and confirm failure**
- [ ] **Step 3: Add minimal helper/component implementation**
- [ ] **Step 4: Re-run targeted Vitest command and confirm pass**

### Task 2: ChatInterface integration

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css`
- Test: `services/aris-web/tests/mobileOverflowLayout.test.ts`

- [ ] **Step 1: Wire user-message target calculation, passed-bubble scroll state, jump handler, and top bar rendering**
- [ ] **Step 2: Add CSS module styles with mobile overflow guards**
- [ ] **Step 3: Extend overflow/style tests if needed**
- [ ] **Step 4: Run targeted tests**

### Task 3: Verification and delivery

**Files:**
- Modify: `services/aris-web/tests/e2e/mobile-overflow.spec.ts` (only if required by observed regression)

- [ ] **Step 1: Run targeted unit tests**
- [ ] **Step 2: Run required mobile overflow regression tests**
- [ ] **Step 3: Review diff for accidental churn**
- [ ] **Step 4: Commit and push feature branch**
