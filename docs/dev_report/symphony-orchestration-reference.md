# Symphony orchestration reference

- Source: https://github.com/openai/symphony
- Cloned path: `/home/ubuntu/project/ARIS/references/symphony`
- Reference commit: `bbef62364db25970cf0e732fc61011ab753d2604`
- Snapshot date: 2026-05-17
- Follow-up issue: https://github.com/Nedian0Brien/ARIS/issues/353

## Verdict

Symphony should be treated as an orchestration spec/reference, not as a library to port into ARIS. The Elixir implementation is useful because it proves the architecture, but ARIS already has the important lower layers: provider runtimes, Codex app-server wiring, permission routing, realtime events, Prisma-backed sessions, project chat, and per-session worktree support.

The highest-value adoption path is to add a thin ARIS-native work orchestration layer above the existing runtime. That layer should turn a tracked work item into a bounded, observable, retryable agent run in an isolated worktree.

## Relevant ARIS Anchors

- Runtime execution: `services/aris-backend/src/runtime/runtimeCore.ts`
- Codex app-server integration: `services/aris-backend/src/runtime/providers/codex/codexRuntime.ts`
- Active run bookkeeping: `services/aris-backend/src/runtime/orchestration/activeRunRegistry.ts`
- Permission routing: `services/aris-backend/src/runtime/orchestration/permissionRouter.ts`
- Runtime storage: `services/aris-backend/src/runtime/prismaStore.ts`
- Run persistence schema: `services/aris-backend/prisma/schema.prisma` (`SessionRun`, `SessionChatEvent`)
- Project chat surface: `services/aris-web/components/project-chat/ProjectChatSurface.tsx`
- Current reference pattern: `docs/dev_report/tessera-parallel-workspace-reference.md`

## Adoption Candidates

### 1. ARIS Work-Item Orchestrator

Priority: High

Symphony's core idea is a single authoritative orchestrator that polls eligible work, claims it, dispatches an agent, retries on failure, reconciles state changes, and exposes operator-visible status. ARIS currently has active run tracking and per-chat runtime state, but not a first-class background work dispatcher.

Recommended ARIS shape:

- Add a `WorkItem` abstraction independent of Linear. Initial adapters can be GitHub Issues and ARIS project chats; Linear can stay optional.
- Keep orchestrator state small and explicit: `running`, `claimed`, `retrying`, `completed`, `last_event_at`, `attempt`.
- Persist durable run facts in the existing `SessionRun`/`SessionChatEvent` path rather than adding a separate job engine first.
- Start with `max_concurrent_agents=1` or project-scoped limits, then widen only after observability is useful.

### 2. Repository-Owned Workflow Contract

Priority: High

Symphony uses `WORKFLOW.md` with YAML front matter plus a prompt body. ARIS already has strong project instructions in `AGENTS.md`, but no runtime-readable contract for poll cadence, work source, worktree rules, max turns, retry backoff, model defaults, or validation policy.

Recommended ARIS shape:

- Introduce `.aris/workflows/default.md` or `ARIS_WORKFLOW.md`.
- Parse YAML front matter for orchestration settings and keep the Markdown body as the work-item prompt template.
- Support dynamic reload for future runs, but keep running turns stable.
- Do not replace `AGENTS.md`; treat the workflow file as runtime configuration and prompt assembly.

### 3. Deterministic Worktree Lifecycle

Priority: High

Symphony's workspaces are deterministic per issue identifier and guarded by path-safety checks. ARIS already has worktree helpers, but the runtime-created worktree path is currently session/branch driven rather than work-item driven.

Recommended ARIS shape:

- Derive orchestration worktree paths from sanitized work item identifiers under a configured root.
- Reuse `scripts/create_worktree_with_shared_node_modules.sh` as the ARIS-specific `after_create` hook.
- Add optional `before_run`, `after_run`, and `before_remove` hooks to support dependency sync, cleanup, and validation.
- Preserve worktrees after successful runs until a merge/cleanup policy explicitly removes them.

### 4. Read-Only Orchestrator Snapshot API

Priority: Medium-High

Symphony's snapshot/status surface is valuable because it is driven from orchestrator state, not from UI inference. ARIS already has realtime WebSocket events, but project-level visibility still benefits from a compact "what is the system doing right now?" endpoint.

Recommended ARIS shape:

- Add a read-only backend endpoint such as `/v1/orchestrator/snapshot`.
- Include running work items, retry queue, attempt counts, last event summary, token totals, rate-limit data, model, branch, and worktree path.
- In the web UI, surface this as a small project operations panel rather than a separate terminal-style dashboard.
- Keep the endpoint read-only initially; operational triggers like refresh can come later.

### 5. Auto-Continuation Turns

Priority: Medium-High

Symphony continues on the same Codex thread while the tracked issue remains active, using a shorter continuation prompt after the first full prompt. ARIS already tracks thread IDs and can resume Codex app-server sessions.

Recommended ARIS shape:

- Add a project-chat "run until done" mode with `max_turns`.
- First turn gets the full rendered work-item prompt.
- Later turns send concise continuation guidance and rely on the existing thread context.
- Stop on terminal state, explicit abort, missing permission, or max-turn exhaustion.

### 6. Scoped Dynamic Tools For Work Tracking

Priority: Medium

Symphony injects a narrow `linear_graphql` dynamic tool so the agent can update the tracker without turning the orchestrator into a tracker-write business layer. ARIS currently handles Codex approval and MCP elicitation, but does not advertise ARIS-specific dynamic tools on `thread/start`.

Recommended ARIS shape:

- Start with one scoped tool, such as `aris_work_item`, for reading/updating the current work item status and progress note.
- If GitHub Issues becomes the first adapter, expose only the minimum issue/comment operations needed for the current issue.
- Keep tool access scoped to the current work item and repository.
- Return structured failures instead of letting unsupported tool requests stall the run.

### 7. Token Accounting Semantics

Priority: Medium

Symphony documents Codex app-server token accounting carefully: live thread token events expose cumulative totals and latest deltas differently. ARIS currently has visible context usage UI, but backend search did not show a robust token-usage pipeline.

Recommended ARIS shape:

- Parse `thread/tokenUsage/updated` and classify totals versus deltas by event type and payload path.
- Store the latest absolute total per thread/run.
- Display context window separately from spend.
- Feed token totals into the orchestrator snapshot so runaway runs are visible.

### 8. Remote Worker Extension

Priority: Low for now

Symphony includes an optional SSH worker model. ARIS should not adopt this until the local work-item orchestrator is stable.

Recommended ARIS shape:

- Keep this as a later scaling track.
- If adopted, surface worker host, workspace path, and host capacity in the same snapshot model.

## What Not To Adopt

- Do not port the Elixir/Phoenix service into ARIS; the existing TypeScript backend is already the right integration point.
- Do not make Linear a required dependency. ARIS should define a tracker adapter interface and start with the tracker the project actually uses.
- Do not copy Symphony's high-trust unattended approval posture as a default. ARIS already has permission routing; keep explicit operator controls unless a workflow opts into stricter automation.
- Do not build a separate terminal dashboard first. ARIS already has Project Chat and realtime event surfaces, so observability should land there.

## Proposed Implementation Sequence

1. Define the ARIS workflow contract and `WorkItem` adapter interface in docs and types only.
2. Add an orchestrator snapshot API backed by existing `ActiveRunRegistry`, `SessionRun`, and runtime event data.
3. Add a small dispatcher that can claim one eligible work item and launch one Codex run in an isolated worktree.
4. Add continuation turns and retry/backoff after the single-run path is observable.
5. Add a scoped dynamic tool for updating the current work item.

This keeps the first implementation small: ARIS gains visibility and orchestration semantics before taking on broad unattended automation.
