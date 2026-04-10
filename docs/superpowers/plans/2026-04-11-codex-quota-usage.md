# Codex Quota Usage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show live Codex quota usage for the active chat session without adding context-window metrics.

**Architecture:** Parse Codex runtime payloads for usage fields inside the backend runtime store, cache the latest per-session or per-chat usage snapshot, expose it through the existing session runtime endpoint, and render it in the session UI only for Codex chats. Keep the feature read-only and avoid provider-side backfills.

**Tech Stack:** Fastify, TypeScript, Vitest, Next.js, React

---

### Task 1: Runtime usage extraction

**Files:**
- Modify: `services/aris-backend/src/runtime/happyClient.ts`
- Test: `services/aris-backend/tests/happyClient.codexUsage.test.ts`

- [ ] Step 1: Write a failing test for extracting Codex usage from representative payloads
- [ ] Step 2: Run the backend test to verify it fails
- [ ] Step 3: Implement minimal usage parsing and in-memory snapshot storage
- [ ] Step 4: Run the backend test to verify it passes

### Task 2: Runtime API exposure

**Files:**
- Modify: `services/aris-backend/src/types.ts`
- Modify: `services/aris-backend/src/store.ts`
- Modify: `services/aris-backend/src/server.ts`
- Modify: `services/aris-web/lib/happy/types.ts`
- Modify: `services/aris-web/lib/happy/client.ts`
- Modify: `services/aris-web/lib/hooks/useSessionRuntime.ts`
- Test: `services/aris-web/tests/runtimeRoute.test.ts`

- [ ] Step 1: Write a failing test for the web/runtime client shape
- [ ] Step 2: Run the web test to verify it fails
- [ ] Step 3: Extend the runtime response to include Codex quota usage
- [ ] Step 4: Run the web test to verify it passes

### Task 3: Session UI

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css`
- Test: `services/aris-web/tests/chatQuotaUsageFormatting.test.ts`

- [ ] Step 1: Write a failing formatting/render test for Codex quota usage text
- [ ] Step 2: Run the web test to verify it fails
- [ ] Step 3: Render Codex quota usage in the session context menu
- [ ] Step 4: Run the web test to verify it passes

### Task 4: Verification

**Files:**
- Modify: none

- [ ] Step 1: Run targeted backend tests
- [ ] Step 2: Run targeted web tests
- [ ] Step 3: Run backend and web typechecks as needed
- [ ] Step 4: Commit and push the branch
