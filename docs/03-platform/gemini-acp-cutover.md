# Gemini ACP Cutover

## Goal

Replace the legacy Gemini `stream-json` runtime path with an ACP-based runtime focused on:

1. Real-time assistant text streaming
2. Stable session resume using ACP session ids
3. Incremental migration to ACP-native tool cards and permission requests

## Sprint 0 Decisions

- Gemini runtime traffic is now routed through `gemini --acp`.
- The ACP `sessionId` is treated as the canonical Gemini thread identifier in ARIS.
- `session/new` is used for fresh chats.
- `session/load` is used for resumed chats.
- `session/load` history replay is ignored before the next prompt to avoid duplicating prior assistant output into the active turn.
- Approval policy is mapped conservatively for now:
  - `yolo` -> `yolo`
  - everything else -> `default`
- Sprint 1 advertises no filesystem or terminal capabilities to Gemini. Chat stability takes priority over tool breadth.

## Sprint 1 Scope

- Stream `agent_message_chunk` notifications as partial text events.
- Emit one completed assistant message after `session/prompt` completes.
- Persist the observed ACP `sessionId` back into ARIS message metadata so future turns can resume.
- Keep existing Gemini action/permission bridges out of the hot path until ACP-native replacements land.

## Current Runtime Shape

- ACP transport: `services/aris-backend/src/runtime/providers/gemini/geminiAcpClient.ts`
- Gemini provider state/runtime: `services/aris-backend/src/runtime/providers/gemini/geminiRuntime.ts`
- Happy runtime integration: `services/aris-backend/src/runtime/happyClient.ts`

## Explicit Non-Goals In This Stage

- ACP tool call rendering
- ACP permission UI wiring
- Filesystem capability exposure
- Terminal capability exposure
- Mode/model UI synchronization beyond runtime request support

## Validation Completed

- Unit tests for ACP client streaming and resume history filtering
- Existing Gemini runtime recovery tests
- Existing Gemini alignment tests updated for ACP runtime behavior
- Manual live Gemini ACP prompt verification with a real `gemini --acp` session

## Next Steps

- Sprint 2: map `tool_call` / `tool_call_update` into action cards
- Sprint 3: map `session/request_permission` into ARIS permission records and decision flow
- Sprint 4: enable additional ACP capabilities such as plan, mode updates, and terminal-backed tool content
