/**
 * ParsedMessage — output of a pure CLI stdout parser.
 *
 * Adapted from horang-labs/tessera (`src/lib/cli/providers/message-types.ts`).
 *
 * Parsers MUST be pure: no direct calls to runtime stores, persistence layers,
 * or WebSocket broadcasters. State mutations are described as side-effect
 * descriptors, and the caller (e.g. happyClient) inspects each descriptor and
 * dispatches the appropriate manager call. This split makes parsers
 * unit-testable with fixtures and keeps protocol logic reversible.
 *
 * Phase 1 establishes the interface only — no provider implements this yet.
 * Side-effect variants will be expanded as Phase 2 (Codex normalization)
 * surfaces real parsing needs.
 */

import type { SessionProtocolEnvelope } from './sessionProtocol.js';
import type { ProviderActionEvent, ProviderPermissionRequest } from './providerRuntime.js';

/**
 * Result of parsing a single newline-delimited stdout line from a CLI
 * process.
 *
 * envelopes: zero or more canonical session-protocol envelopes the caller
 * can broadcast or persist. An empty array means "the line was understood but
 * intentionally produced no envelope" (e.g. heartbeats).
 *
 * sideEffect: an optional descriptor for state mutations the parser cannot
 * perform itself.
 */
export interface ParsedMessage {
  envelopes: SessionProtocolEnvelope[];
  sideEffect?: ParsedMessageSideEffect;
}

/**
 * Discriminated union of state mutations a parser can request.
 *
 * The set is intentionally small for Phase 1. Phase 2 (Codex) and Phase 4
 * (Claude/Gemini migration) will extend this union as concrete provider
 * extractions surface real needs.
 */
export type ParsedMessageSideEffect =
  /** Update the live process's `isGenerating` flag (turn boundary). */
  | { type: 'set_generating'; value: boolean }
  /**
   * Persist or refresh provider-side session state (e.g. Codex threadId,
   * Gemini ACP sessionId). The shape is provider-specific and is stored in
   * `sessions.provider_state` JSON column.
   */
  | { type: 'update_provider_state'; providerState: Record<string, unknown> }
  /**
   * Inform the runtime that the assistant emitted an action (file read/
   * write/list, command execution). Used both for streaming UI updates and
   * inferred-action persistence after a turn finishes.
   */
  | { type: 'emit_action'; action: ProviderActionEvent }
  /**
   * Provider has issued a permission request that needs runtime adjudication
   * before tool execution can proceed.
   */
  | { type: 'request_permission'; request: ProviderPermissionRequest }
  /**
   * Provider has retracted a permission request (e.g. tool call cancelled
   * before approval). The runtime should resolve any pending decision waiter
   * with `deny` to avoid leaking promises.
   */
  | { type: 'cancel_permission'; callId: string; approvalId?: string }
  /**
   * Send a JSON-RPC response to the CLI process for a server-initiated
   * request the parser saw on stdout. Used by Codex app-server and Gemini
   * ACP channels where the runtime answers tool invocations over the same
   * stream.
   */
  | { type: 'send_json_rpc_response'; requestId: string | number; result: Record<string, unknown> }
  | {
      type: 'send_json_rpc_error';
      requestId: string | number;
      code: number;
      message: string;
      data?: unknown;
    }
  /**
   * Mark the turn as finished with a terminal reason. The caller is
   * responsible for invoking persistence and resolving the turn promise.
   */
  | { type: 'turn_complete'; reason: 'completed' | 'aborted' | 'error' | 'timeout' };

/**
 * Type guard to narrow a ParsedMessage to a specific side-effect variant.
 *
 * Useful in dispatchers that switch on `sideEffect.type` and want exhaustive
 * checking under `--strict`.
 */
export function hasSideEffect<T extends ParsedMessageSideEffect['type']>(
  message: ParsedMessage,
  type: T,
): message is ParsedMessage & { sideEffect: Extract<ParsedMessageSideEffect, { type: T }> } {
  return message.sideEffect?.type === type;
}
