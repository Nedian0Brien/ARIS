/**
 * CliProvider — primary abstraction for plugging in coding-agent CLIs
 * (Claude, Codex, Gemini, OpenCode, …) at the process level.
 *
 * Adapted from horang-labs/tessera (`src/lib/cli/providers/provider-contract.ts`).
 *
 * Surface scope:
 *   - Process lifecycle (spawn, sendMessage, sendInterrupt)
 *   - Stdout parsing (parseStdout — pure)
 *   - Connection probing (checkStatus, isAvailable)
 *   - Provider-side approvals / config updates / runtime controls
 *
 * Out of scope (handled elsewhere):
 *   - Higher-level turn orchestration (sendTurn / abortTurn / recoverSession)
 *     lives in `ProviderRuntime` (`./providerRuntime.ts`). During the
 *     refactor (Phases 2–4) the two interfaces will coexist; long-term
 *     `ProviderRuntime` will be implemented on top of `CliProvider`.
 *   - Persistence and broadcasting are caller responsibilities — driven by
 *     `ParsedMessageSideEffect` descriptors emitted by `parseStdout`.
 *
 * Codex currently implements the process-level adapter; Claude/Gemini still
 * use their ProviderRuntime extraction paths directly while the long-term
 * runtime-on-adapter migration continues.
 */

import type { ChildProcess } from 'child_process';
import type { ParsedMessage } from './parsedMessage.js';
import type { CliStatusResult, CheckStatusOptions } from './cliStatus.js';
import type { ProviderRuntimeFlavor } from './providerRuntime.js';
import type { ApprovalPolicy } from '../../types.js';

/**
 * Options passed to the provider when creating or resuming a CLI session.
 *
 * Mirrors Tessera's `SpawnOptions` but reuses ARIS's existing semantic
 * vocabulary (ApprovalPolicy, AgentFlavor) instead of introducing new types.
 */
export interface CliSpawnOptions {
  /** One-shot prompt for exec-style providers. Session transports may ignore it. */
  prompt?: string;
  /** Provider permission/approval mode for the spawned process. */
  approvalPolicy?: ApprovalPolicy;
  /** User id for settings-aware spawn behavior (env propagation, etc). */
  userId?: string;
  /** Normalized model identifier (e.g. "claude-sonnet-4-6"). */
  model?: string;
  /** Provider-specific reasoning effort / thinking intensity. */
  reasoningEffort?: string | null;
  /**
   * Local session id (ARIS UUID). Semantics depend on `resume`:
   *   - resume === true : ask the provider to resume an existing CLI session
   *     (e.g. `claude --resume <id>`).
   *   - resume falsy    : new session; the id MAY be passed as a creation
   *     hint so the provider's session id matches the ARIS UUID.
   */
  sessionId?: string;
  /** When true, resume an existing CLI session identified by sessionId. */
  resume?: boolean;
  /**
   * Codex-specific: threadId from a prior thread/start response. Stored in
   * `sessions.provider_state` as `{ threadId: "..." }`.
   */
  threadId?: string;
  /**
   * Working directory for the spawned process. Required because ARIS sessions
   * always have a project path.
   */
  workDir: string;
  /** Optional abort signal for the spawn itself (separate from turn signal). */
  signal?: AbortSignal;
  /** Caller-supplied environment overrides merged on top of process.env. */
  envOverrides?: NodeJS.ProcessEnv;
}

/**
 * Result of `CliProvider.spawn()`.
 */
export interface CliSpawnResult {
  ok: boolean;
  /** The spawned child process (always present so callers can attach handlers
   * even on partial-failure paths). */
  process: ChildProcess;
  /** Populated when ok === false. */
  error?: Error;
}

/**
 * Content for `sendMessage`. Either a plain string or structured content
 * blocks; concrete shape is provider-specific. The interface stays loose so
 * Codex (JSON-RPC), Claude (stream-json), and Gemini (ACP) can each accept
 * what they need without coupling.
 */
export type CliMessageContent = string | ReadonlyArray<unknown>;

/**
 * Provider-side runtime patch sent mid-session (e.g. permission mode, model,
 * reasoning effort).
 */
export interface CliRuntimeConfigPatch {
  permissionMode?: string;
  model?: string;
  reasoningEffort?: string | null;
  [key: string]: unknown;
}

/**
 * The CliProvider interface itself.
 *
 * All non-optional methods MUST be implemented. Optional methods are typed
 * as such because not every CLI supports every capability:
 *   - Claude streamlines plan approval and AskUserQuestion.
 *   - Codex needs raw JSON-RPC response/error sending for app-server.
 *   - Gemini ACP needs both.
 */
export interface CliProvider {
  /** Stable machine identifier matching `AgentFlavor`. */
  getProviderId(): ProviderRuntimeFlavor;

  /** Human-readable display name (UI dropdowns, log messages). */
  getDisplayName(): string;

  /**
   * Quick boolean availability probe. Implementations SHOULD delegate to
   * `checkStatus()` and return `result.status === 'connected'`. Kept as a
   * convenience so callers that only care about "fully usable" don't have
   * to destructure.
   */
  isAvailable(options?: CheckStatusOptions): Promise<boolean>;

  /**
   * Build CLI args for the given spawn options. Does NOT include the binary
   * name. Pure function — useful for tests and command preview.
   */
  getCliArgs(options: CliSpawnOptions): string[];

  /**
   * Spawn the CLI process for a session. Implementations are responsible for
   * arg construction, env propagation, and stdio configuration.
   */
  spawn(options: CliSpawnOptions): Promise<CliSpawnResult>;

  /**
   * Write a message to the CLI process stdin in the format the CLI expects.
   * Returns false when the write was rejected (process not writable, etc.).
   */
  sendMessage(proc: ChildProcess, content: CliMessageContent): boolean;

  /**
   * Parse a single newline-delimited stdout line. MUST be pure: no direct
   * calls to stores, persistence, or broadcasters. Side effects are
   * surfaced via `ParsedMessage.sideEffect` descriptors.
   *
   * Returns null when the line is unparseable garbage that should be
   * dropped silently. Returns an empty `envelopes` array when the line was
   * understood but intentionally produces no envelope (e.g. heartbeats).
   */
  parseStdout(line: string): ParsedMessage | null;

  /**
   * Optional session-aware variant. Use when the provider needs the local
   * session id to resolve parser state or correlate JSON-RPC ids across
   * multiple lines.
   */
  parseSessionStdout?(sessionId: string, line: string): ParsedMessage[];

  /**
   * Optional exit hook for provider-owned cleanup (parser state flush,
   * pending request rejection, etc.). Called once per process exit.
   */
  handleSessionExit?(sessionId: string, exitCode: number | null): ParsedMessage[];

  /**
   * Optional: update provider-side session configuration mid-session
   * (permission mode, model, reasoning effort). Returns false when the
   * patch could not be delivered.
   */
  updateSessionConfig?(proc: ChildProcess, patch: CliRuntimeConfigPatch): boolean;

  /**
   * Optional: respond to a pending server-initiated approval request that
   * was surfaced via a `request_permission` side effect.
   */
  sendApprovalResponse?(
    proc: ChildProcess,
    requestId: string | number,
    decision: 'accept' | 'decline',
  ): void;

  /**
   * Optional: send a raw JSON-RPC result to a CLI process for a
   * provider-specific server-initiated request (Codex app-server, Gemini ACP).
   */
  sendJsonRpcResponse?(
    proc: ChildProcess,
    requestId: string | number,
    result: Record<string, unknown>,
  ): void;

  /**
   * Optional: send a raw JSON-RPC error for an unsupported or failed request.
   */
  sendJsonRpcError?(
    proc: ChildProcess,
    requestId: string | number,
    error: { code: number; message: string; data?: unknown },
  ): void;

  /**
   * Optional: send an interrupt/cancel signal to the CLI process. Returns
   * false when the CLI cannot be interrupted in its current state.
   */
  sendInterrupt?(proc: ChildProcess, sessionId: string): boolean;

  /**
   * Optional: provider-specific startup work after the process has been
   * registered and stdio handlers attached (e.g. send `initialize` request).
   */
  onSessionReady?(proc: ChildProcess, sessionId: string): boolean;

  /**
   * Probe the CLI installation and authentication state.
   *
   * Implementations SHOULD:
   *   - Bail out to "not_installed" when the version command fails.
   *   - Return "needs_login" when version succeeds but auth fails.
   *   - Enforce a 5s timeout per command.
   *
   * Read-only: MUST NOT persist state or write to other subsystems.
   */
  checkStatus(options?: CheckStatusOptions): Promise<CliStatusResult>;
}
