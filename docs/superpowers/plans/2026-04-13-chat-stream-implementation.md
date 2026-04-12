# Chat-Stream Architecture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace session-global runtime message persistence with chat-scoped event streams and run-scoped execution state, while keeping legacy sessions readable but not writable.

**Architecture:** Add `Chat`, `Run`, and `ChatEvent` as first-class persistence models, switch runtime append/read APIs to chat scope, then update the frontend to consume chat-native cursors and status. Legacy sessions remain readable through the old path but cannot accept new runtime execution.

**Tech Stack:** Prisma, Fastify, TypeScript, Next.js, React, Vitest

---

### Task 1: Add Chat-Scoped Persistence Models

**Files:**
- Modify: `services/aris-backend/prisma/schema.prisma`
- Modify: `services/aris-backend/src/types.ts`
- Modify: `services/aris-backend/src/store.ts`
- Modify: `services/aris-backend/src/runtime/prismaStore.ts`
- Test: `services/aris-backend/tests/prismaRuntimeStore.test.ts`

- [ ] Write failing backend store tests for chat-local append order, independent chat concurrency, and legacy write rejection.
- [ ] Run the targeted Prisma store tests and verify the new cases fail for the expected reason.
- [ ] Add Prisma models for `Chat`, `Run`, and `ChatEvent`, plus any required relations/indices.
- [ ] Extend backend types/store interfaces for chat-scoped reads, writes, active-run lookup, and legacy detection.
- [ ] Implement minimal Prisma store methods to satisfy the new tests.
- [ ] Re-run the targeted Prisma store tests until they pass.
- [ ] Commit the persistence slice.

### Task 2: Switch Backend Runtime and API Routes to Chat Scope

**Files:**
- Modify: `services/aris-backend/src/server.ts`
- Modify: `services/aris-backend/src/runtime/happyClient.ts`
- Modify: `services/aris-backend/src/runtime/providers/claude/claudeMessageQueue.ts`
- Modify: `services/aris-backend/src/runtime/providers/gemini/geminiMessageQueue.ts`
- Test: `services/aris-backend/tests/server.test.ts`
- Test: `services/aris-backend/tests/happyClient.streamJson.test.ts`

- [ ] Write failing route/runtime tests for `POST /v1/chats/:chatId/events`, chat-local event listing, active run lookup, and legacy-session execution rejection.
- [ ] Run the targeted route/runtime tests and verify they fail for missing chat-scoped APIs.
- [ ] Add chat-native backend routes and wire them to the new store methods.
- [ ] Change runtime append paths to persist `ChatEvent` records with explicit `runId`.
- [ ] Keep legacy session reads available, but reject new runtime writes for legacy sessions.
- [ ] Re-run the targeted backend tests until they pass.
- [ ] Commit the backend API/runtime slice.

### Task 3: Move Frontend Event Loading and Runtime State to Chat Scope

**Files:**
- Modify: `services/aris-web/lib/hooks/useSessionEvents.ts`
- Modify: `services/aris-web/lib/happy/client.ts`
- Modify: `services/aris-web/app/api/runtime/sessions/[sessionId]/events/route.ts`
- Modify: `services/aris-web/app/api/runtime/sessions/[sessionId]/events/stream/route.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Test: `services/aris-web/tests/sessionEvents.test.ts`
- Test: `services/aris-web/tests/sessionEventsRoute.test.ts`
- Test: `services/aris-web/tests/sessionEventsStreamRoute.test.ts`

- [ ] Write failing frontend tests for chat-local cursors, chat-local SSE/polling isolation, and legacy read-only behavior in the chat interface.
- [ ] Run the targeted frontend tests and verify they fail for the expected contract mismatch.
- [ ] Update the web runtime client and route handlers to call the new chat-native backend APIs.
- [ ] Refactor `useSessionEvents` to track `after_seq` per chat instead of session-global cursors.
- [ ] Update `ChatInterface` runtime notice and action affordances so legacy sessions are readable but not executable.
- [ ] Re-run the targeted frontend tests until they pass.
- [ ] Run the mobile overflow tests if any UI layout changed in the session screen.
- [ ] Commit the frontend slice.

### Task 4: Full Verification, Merge, and Deploy

**Files:**
- Modify: `docs/superpowers/specs/2026-04-13-chat-stream-architecture-design.md` (only if implementation forces a design correction)
- Modify: `docs/superpowers/plans/2026-04-13-chat-stream-implementation.md` (checkbox/progress updates if needed)

- [ ] Run `npm test` and `npm run build` in `services/aris-backend`.
- [ ] Run the relevant `services/aris-web` test suites for session events and any changed UI behavior.
- [ ] If UI changed in the session screen, run `services/aris-web/tests/mobileOverflowLayout.test.ts` and `services/aris-web/tests/e2e/mobile-overflow.spec.ts`.
- [ ] Inspect the diff for unintended legacy-path regressions.
- [ ] Commit the final integrated state.
- [ ] Push the implementation branch.
- [ ] Merge to `main` from a dedicated merge worktree.
- [ ] Deploy with `DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/deploy_backend_zero_downtime.sh` and any required web deploy if frontend APIs changed.
- [ ] Run post-deploy health checks: `/health`, runtime connection, PM2 logs, and web/session verification.
