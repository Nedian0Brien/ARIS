# Composer Modes Spec

## Scope

Chat Composer v2 supports three user-visible modes: Agent, Plan, and Terminal. The mode is part of the user intent and must be visible in UI state, optimistic timeline metadata, and server routing.

## Agent Mode

- Route: existing `POST /api/runtime/sessions/:sessionId/events`
- Payload: normal user instruction plus model and agent metadata.
- Behavior: unchanged runtime execution path.
- Timeline: normal user bubble and agent response styling.

## Plan Mode

- Route: existing chat message route.
- Payload metadata: `composerMode: "plan"`.
- Prompt contract: the submitted text is prefixed with a plan-only instruction that tells the agent not to execute tools, shell commands, file writes, deploys, or destructive actions.
- UI contract: user submission keeps the plan mode metadata, and follow-up visual treatment may display violet plan accents when the response metadata is available.
- Failure fallback: if the backend does not understand `composerMode`, the prompt prefix is still sufficient to keep the response plan-only.

## Terminal Mode

- Route: `POST /api/runtime/sessions/:sessionId/terminal`
- Payload:
  - `chatId`: active chat id.
  - `command`: raw command from the composer.
  - `agent`: active chat agent for attribution.
  - `model` and `modelReasoningEffort`: included for continuity metadata.
- Behavior: execute the command in the session workspace path and append two events: a user command event and a `command_execution` result event.
- Timeline: command output renders through the existing action/tool event renderer.
- Permission rule: the route is operator-only. Additional dangerous-command approval can be layered on top of this contract without changing the composer API.
- Failure fallback: non-zero exit codes are represented in the result event body; route-level failures return a JSON error and keep composer input available for retry.

## Accessibility

- Mode toggle uses `aria-pressed`.
- Terminal snippets insert text into the composer without auto-submitting.
- Mode color must not be the only state indicator; labels remain visible in every mode.
