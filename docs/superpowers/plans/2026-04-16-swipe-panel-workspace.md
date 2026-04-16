# Swipe Panel Workspace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current chat-plus-right-sidebar session layout with a horizontal workspace pager where chat is page 0, additional pages are user-created panels, `Preview` is fully interactive, and `Explorer` / `Terminal` / `Bookmark` ship as placeholders.

**Architecture:** Add a session-scoped panel layout model on `Workspace`, render chat and panels inside a shared horizontal pager, derive a `Create Panel` page at the end of the page track, and isolate preview traffic behind a dedicated preview gateway/token flow. Keep the existing customization sidebar out of the new pager mental model and preserve it only as legacy functionality while the new workspace rolls out.

**Tech Stack:** Prisma, Next.js App Router, React, TypeScript, custom Node HTTP/WebSocket server, Vitest, Playwright

---

## File Map

### Persistence and panel contracts

- Modify: `services/aris-web/prisma/schema.prisma`
- Create: `services/aris-web/prisma/migrations/<timestamp>_add_workspace_panel_layout/migration.sql`
- Modify: `services/aris-web/lib/happy/workspaces.ts`
- Create: `services/aris-web/lib/workspacePanels/types.ts`
- Create: `services/aris-web/lib/workspacePanels/layout.ts`
- Create: `services/aris-web/lib/workspacePanels/defaults.ts`
- Create: `services/aris-web/app/api/runtime/sessions/[sessionId]/panels/route.ts`

### Pager and page rendering

- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/WorkspacePager.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/WorkspacePager.module.css`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/useWorkspacePager.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/useWorkspacePanels.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PanelPageShell.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PanelPageRenderer.tsx`

### Create-panel and placeholder flows

- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/CreatePanelPage.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/CreatePanelPage.module.css`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PlaceholderPanelPage.tsx`

### Preview gateway and UI

- Create: `services/aris-web/lib/preview/config.ts`
- Create: `services/aris-web/lib/preview/sessionToken.ts`
- Create: `services/aris-web/lib/preview/proxyGateway.ts`
- Create: `services/aris-web/app/api/runtime/sessions/[sessionId]/panels/[panelId]/preview-token/route.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PreviewPanelPage.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PreviewPanelPage.module.css`
- Modify: `services/aris-web/lib/config.ts`
- Modify: `services/aris-web/server.mjs`
- Modify: `services/aris-web/README.md`
- Modify: `deploy/README.md`

### Tests

- Create: `services/aris-web/tests/workspacePanelLayout.test.ts`
- Create: `services/aris-web/tests/workspacePanelsRoute.test.ts`
- Create: `services/aris-web/tests/workspacePager.test.tsx`
- Create: `services/aris-web/tests/workspacePanelCreation.test.tsx`
- Create: `services/aris-web/tests/previewGateway.test.ts`
- Create: `services/aris-web/tests/previewTokenRoute.test.ts`
- Modify: `services/aris-web/tests/mobileOverflowLayout.test.ts`
- Modify: `services/aris-web/tests/e2e/mobile-overflow.spec.ts`

### Legacy boundary checks

- Review only: `services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.tsx`
- Review only: `services/aris-web/app/sessions/[sessionId]/CustomizationSidebar.module.css`

---

### Task 1: Add Session-Scoped Panel Layout Persistence

**Files:**
- Modify: `services/aris-web/prisma/schema.prisma`
- Create: `services/aris-web/prisma/migrations/<timestamp>_add_workspace_panel_layout/migration.sql`
- Modify: `services/aris-web/lib/happy/workspaces.ts`
- Create: `services/aris-web/lib/workspacePanels/types.ts`
- Create: `services/aris-web/lib/workspacePanels/layout.ts`
- Create: `services/aris-web/lib/workspacePanels/defaults.ts`
- Create: `services/aris-web/app/api/runtime/sessions/[sessionId]/panels/route.ts`
- Test: `services/aris-web/tests/workspacePanelLayout.test.ts`
- Test: `services/aris-web/tests/workspacePanelsRoute.test.ts`

- [ ] Write failing tests for panel layout normalization, empty-layout defaults, create/delete persistence, and active-page restoration.
- [ ] Run `npm test -- workspacePanelLayout workspacePanelsRoute` in `services/aris-web` and verify the new cases fail for missing panel storage behavior.
- [ ] Add `panelLayoutJson` to `Workspace` in Prisma and create the matching migration.
- [ ] Define the serialized layout contract in `types.ts` and normalization/default helpers in `layout.ts` / `defaults.ts`.
- [ ] Extend `lib/happy/workspaces.ts` with read/write helpers for `panelLayoutJson`.
- [ ] Implement `GET` and `POST` in `/api/runtime/sessions/[sessionId]/panels/route.ts` for normalized load and panel creation.
- [ ] Re-run `npm test -- workspacePanelLayout workspacePanelsRoute` until the persistence contract passes.
- [ ] Commit the persistence slice with a message like `feat: add session panel layout persistence`.

### Task 2: Build The Horizontal Workspace Pager Shell

**Files:**
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.module.css`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/WorkspacePager.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/WorkspacePager.module.css`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/useWorkspacePager.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PanelPageShell.tsx`
- Test: `services/aris-web/tests/workspacePager.test.tsx`

- [ ] Write failing component tests for page order (`Chat -> panels -> Create Panel`), active-page switching, keyboard/arrow navigation, and chat-as-page-zero behavior.
- [ ] Run `npm test -- workspacePager` in `services/aris-web` and verify the pager tests fail before implementation.
- [ ] Create `WorkspacePager` and `useWorkspacePager` to own page indexing, derived `Create Panel` page injection, and non-swipe navigation controls.
- [ ] Refactor `ChatInterface.tsx` to render the chat surface inside the pager instead of the current permanent center layout.
- [ ] Remove the new workspace from the `rightPanel` dependency chain in `ChatInterface.module.css` and replace it with full-page pager sizing rules.
- [ ] Apply width guards across the pager/page chain (`min-width: 0`, `width: 100%`, `max-width: 100%`) to protect mobile layout.
- [ ] Re-run `npm test -- workspacePager` until the pager shell passes.
- [ ] Commit the pager shell with a message like `feat: add swipe workspace pager shell`.

### Task 3: Implement Create-Panel Flow, Placeholder Pages, And Delete

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/useWorkspacePanels.ts`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PanelPageRenderer.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/CreatePanelPage.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/CreatePanelPage.module.css`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PlaceholderPanelPage.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/ChatInterface.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/workspace-panels/WorkspacePager.tsx`
- Test: `services/aris-web/tests/workspacePanelCreation.test.tsx`
- Test: `services/aris-web/tests/workspacePanelsRoute.test.ts`

- [ ] Write failing tests for `Create Panel` tile rendering, panel creation by type, auto-navigation to the new page, duplicate type creation, and active-panel deletion fallback.
- [ ] Run `npm test -- workspacePanelCreation workspacePanelsRoute` in `services/aris-web` and verify the create/delete flows fail initially.
- [ ] Implement `useWorkspacePanels` to load layout, autosave `activePage`, create panels, and delete panels.
- [ ] Build `CreatePanelPage` with tile cards for `Preview`, `Explorer`, `Terminal`, and `Bookmark`.
- [ ] Build `PanelPageRenderer` and `PlaceholderPanelPage` so non-preview pages render consistent shells with clear `coming soon` messaging.
- [ ] Add panel delete affordances to the shared page shell and ensure deleting the active page lands on a valid neighboring page or chat.
- [ ] Re-run `npm test -- workspacePanelCreation workspacePanelsRoute` until the panel creation flows pass.
- [ ] Commit the create/delete slice with a message like `feat: add workspace panel creation flow`.

### Task 4: Add Isolated Preview Gateway Infrastructure

**Files:**
- Create: `services/aris-web/lib/preview/config.ts`
- Create: `services/aris-web/lib/preview/sessionToken.ts`
- Create: `services/aris-web/lib/preview/proxyGateway.ts`
- Create: `services/aris-web/app/api/runtime/sessions/[sessionId]/panels/[panelId]/preview-token/route.ts`
- Modify: `services/aris-web/lib/config.ts`
- Modify: `services/aris-web/server.mjs`
- Modify: `services/aris-web/README.md`
- Modify: `deploy/README.md`
- Test: `services/aris-web/tests/previewGateway.test.ts`
- Test: `services/aris-web/tests/previewTokenRoute.test.ts`

- [ ] Write failing tests for preview token minting, session ownership validation, allowlisted port parsing, loopback-only target enforcement, and WebSocket upgrade authorization.
- [ ] Run `npm test -- previewGateway previewTokenRoute` in `services/aris-web` and verify the new gateway tests fail before implementation.
- [ ] Extend `lib/config.ts` with preview-origin and allowed-port environment parsing.
- [ ] Implement signed preview session tokens that bind `sessionId`, `panelId`, `port`, and expiry.
- [ ] Implement the preview-token route that validates user/session access and returns the isolated preview URL for a panel.
- [ ] Extract preview proxy behavior into `proxyGateway.ts` so `server.mjs` only wires request/upgrade handling and auth checks.
- [ ] Update `server.mjs` to serve the preview gateway host/path and proxy HTTP + WebSocket traffic without forwarding ARIS auth cookies to the target dev server.
- [ ] Document the new preview environment and deployment expectations in `services/aris-web/README.md` and `deploy/README.md`.
- [ ] Re-run `npm test -- previewGateway previewTokenRoute` until the gateway/auth layer passes.
- [ ] Commit the preview infrastructure with a message like `feat: add isolated preview gateway`.

### Task 5: Wire The Real Preview Panel UI

**Files:**
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PreviewPanelPage.tsx`
- Create: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PreviewPanelPage.module.css`
- Modify: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PanelPageRenderer.tsx`
- Modify: `services/aris-web/app/sessions/[sessionId]/workspace-panels/useWorkspacePanels.ts`
- Modify: `services/aris-web/app/sessions/[sessionId]/workspace-panels/PanelPageShell.tsx`
- Test: `services/aris-web/tests/workspacePanelCreation.test.tsx`
- Test: `services/aris-web/tests/workspacePager.test.tsx`

- [ ] Write failing tests for preview panel rendering, token fetch on mount, connection state display, port/path editing persistence, and iframe URL refresh after config changes.
- [ ] Run `npm test -- workspacePanelCreation workspacePager` in `services/aris-web` and verify the preview-specific expectations fail.
- [ ] Implement `PreviewPanelPage` with header controls for `port`, `path`, refresh, and connection status.
- [ ] Fetch preview tokens through the new route, render the iframe, and surface `connecting`, `ready`, `unreachable`, and `proxy_error` states.
- [ ] Persist preview config changes back through `useWorkspacePanels` so per-session preview pages restore correctly.
- [ ] Re-run `npm test -- workspacePanelCreation workspacePager` until preview panel behavior passes.
- [ ] Commit the preview UI with a message like `feat: add interactive preview panel page`.

### Task 6: Final Verification, Overflow Guard, And Delivery

**Files:**
- Modify: `docs/superpowers/specs/2026-04-16-swipe-panel-workspace-design.md` only if implementation forces a design correction
- Modify: `docs/superpowers/plans/2026-04-16-swipe-panel-workspace.md` for task status updates if desired
- Test: `services/aris-web/tests/mobileOverflowLayout.test.ts`
- Test: `services/aris-web/tests/e2e/mobile-overflow.spec.ts`

- [ ] Run the focused unit tests created or modified in Tasks 1-5.
- [ ] Run `npm test` in `services/aris-web` if the focused suites are clean.
- [ ] Run `npm run build` in `services/aris-web` to catch App Router or bundling regressions.
- [ ] Run `services/aris-web/tests/mobileOverflowLayout.test.ts` because the session screen layout changed.
- [ ] Run `services/aris-web/tests/e2e/mobile-overflow.spec.ts` because the session screen and horizontal page chain changed.
- [ ] Manually verify `Chat -> Create Panel -> Preview` and `Chat -> Preview -> Create Panel` flows in the hot-reload environment.
- [ ] Inspect the diff to confirm the new pager no longer depends on the right sidebar slot for its primary UX.
- [ ] Commit the integrated state with a message like `feat: ship swipe panel workspace v1`.
- [ ] Push the implementation branch.
- [ ] Merge to `main` from a dedicated merge worktree only after review.
- [ ] If deployment is requested, deploy with `DEPLOY_ENV_FILE=/home/ubuntu/.config/aris/prod.env ./deploy/deploy_web.sh` and complete the post-deploy health checks in `deploy/README.md`.
