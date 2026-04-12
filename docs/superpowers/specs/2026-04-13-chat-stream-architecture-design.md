# Chat-Stream Architecture Design

Date: 2026-04-13
Status: Approved in chat, pending implementation plan

## Goal

Replace the current session-global message append model with a chat-scoped event stream model that supports multiple chats running concurrently inside the same workspace/session without write contention on a single `session` row or a single session-wide `seq`.

## Why The Current Structure Breaks

The current runtime message path appends nearly all agent output through `POST /v3/sessions/:sessionId/messages`.

The backing store currently:

- reads the maximum `seq` for a `sessionId`
- computes `nextSeq = max(seq) + 1`
- inserts a new `sessionMessage`
- updates the same `session` row status in the same transaction
- runs the write under `Serializable` isolation

This creates two shared write hot spots for every concurrent chat under the same session:

- one shared append sequence
- one shared session status row

`chatId` is currently a filter/meta concern, not the primary storage partition key. That means concurrent chats still collide at the same persistence boundary even when the UI treats them as separate chat threads.

## Chosen Direction

Approved design choices:

- migration mode: full cutover
- legacy handling: cutover for new data, legacy sessions remain readable but not writable
- stream model: chat + run hybrid

This means:

- `chat` is the primary append/read stream boundary
- `run` is a distinct execution lifecycle object linked to a chat
- legacy session-global writes are not reused for new runtime activity

## Data Model

### Session

`Session` remains the workspace/project container.

Responsibilities:

- workspace path and metadata
- top-level listing and ownership
- legacy/new-model discriminator if needed

Non-responsibilities after cutover:

- no session-global `seq`
- no session-global source-of-truth runtime status

### Chat

Each user-visible chat becomes its own append stream.

Suggested fields:

- `id`
- `sessionId`
- `title`
- `status`
- `lastSeq`
- `lastEventAt`
- `createdAt`
- `updatedAt`
- `isLegacy` or equivalent discriminator when needed

`Chat.status` is the queryable state for that chat, not the workspace-wide session state.

### Run

Each execution turn/lifecycle becomes a `Run`.

Suggested fields:

- `id`
- `chatId`
- `sessionId`
- `agent`
- `model`
- `status`
- `startedAt`
- `finishedAt`
- `errorMessage`
- optional execution metadata

Rules:

- multiple chats in the same session may have active runs concurrently
- default policy is at most one active run per chat unless explicit multi-run support is added later

### ChatEvent

`ChatEvent` becomes the append-only event log.

Suggested fields:

- `id`
- `chatId`
- `sessionId`
- `runId` nullable but explicit
- `seq` scoped to `chatId`
- `type`
- `title`
- `text`
- `meta`
- `createdAt`

All user-visible agent/runtime events should be represented here:

- text outputs
- tool actions
- permission events
- run lifecycle events
- error events

`runId` must be a first-class column, not only nested inside metadata.

## Persistence Model

### Required Behavioral Change

All new runtime appends must target chat-scoped streams.

That means:

- sequence allocation happens per `chatId`
- status updates happen on `chat` and `run`, not on `session`
- concurrent chat writes no longer contend on one session-global append counter

### Sequencing

The new correctness boundary is:

- total order within one chat
- no global order guarantee across chats

Cross-chat ordering is unnecessary for the product requirement and is the main source of the current contention problem.

## API Changes

### New Write API

Replace session-global append for new data with a chat-scoped event append API.

Target direction:

- `POST /v1/chats/:chatId/events`

This endpoint:

- validates chat ownership/session linkage
- allocates the next chat-local sequence
- appends a `ChatEvent`
- updates chat/run state projections as needed

### New Read APIs

Replace session-global read + chat filter with chat-native APIs.

Target direction:

- `GET /v1/chats/:chatId/events?after_seq=...`
- `GET /v1/chats/:chatId/runs/active`
- `GET /v1/runs/:runId`

### SSE / Realtime

Realtime feeds must also be chat-scoped.

Target direction:

- SSE path changes from session-level with `chatId` filter to chat-native event stream
- cursors become `after_seq` within one chat stream

This removes the current ambiguity where multiple chats share one session-level cursor space.

## Frontend Impact

The frontend must stop treating session-global runtime state as the source of truth for chat execution.

Main behavioral changes:

- `useSessionEvents` or equivalent hook becomes chat-stream based
- runtime status indicators read `chat` and `run` state directly
- UI must not merge or infer chat state through a session-global event stream

Legacy sessions should show an explicit read-only badge/message so users understand why execution is unavailable there.

## Legacy Policy

Approved legacy behavior:

- legacy sessions remain listable and readable
- legacy sessions cannot start new execution or append new runtime events
- new sessions/chats use only the new model

This avoids attempting risky in-place data migration while preventing new writes from falling back into the old conflict-prone model.

## Migration / Cutover Plan

1. Add new tables/entities for `Chat`, `Run`, and `ChatEvent`
2. Add new repositories/store methods
3. Route new session/chat creation onto the new model
4. Switch runtime event append paths to new chat-scoped APIs
5. Switch polling/SSE/status lookups to chat-scoped reads
6. Update frontend to render new runtime state model
7. Mark legacy sessions as read-only in UI and backend
8. Remove reliance on session-global runtime status

This is intentionally a cutover, not a historical backfill migration.

## Testing Requirements

Minimum required verification:

- persistence test proving concurrent writes to two chats in one session do not conflict
- status test proving chat A state is not overwritten by chat B events
- SSE/polling test proving chat-local cursors advance independently
- frontend/E2E test proving simultaneous runs in two chats do not mix messages or state
- legacy-path test proving old sessions remain readable but reject new execution

## Risks

Primary risks:

- incomplete cutover leaving some append paths on the old session-global model
- frontend continuing to infer runtime state from session-level assumptions
- hidden legacy write paths reintroducing the old contention pattern

Mitigation:

- treat session-global message append as deprecated for new runtime data
- inventory all append producers before implementation
- add explicit tests for cross-chat concurrency and legacy write rejection

## Recommendation

Proceed with implementation as a full cutover to:

- chat-scoped append streams
- run-scoped execution lifecycle state
- legacy read-only support

Do not attempt to preserve session-global runtime sequencing semantics for new data.
