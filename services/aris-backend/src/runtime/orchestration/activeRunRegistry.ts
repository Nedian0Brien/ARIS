/**
 * ActiveRunRegistry — bookkeeping for in-flight provider runs (codex/gemini)
 * plus shutdown-drain coordination.
 *
 * Owned by `runtime/runtimeCore.ts` until 2.5e, where it moves into a
 * standalone module to continue the runtime-core extraction track started
 * in 2.5c (PermissionRouter) and 2.5d (RealtimeEventBus).
 *
 * Run-key semantics (preserved verbatim):
 *   - `${projectId}:__default__` when no chat scope is provided.
 *   - `${projectId}:${chatId.trim()}` when a non-empty chat scope exists.
 *   - `isProjectRunKey(runKey, projectId)` returns true for the default
 *     scope or any run-key prefixed with `${projectId}:`.
 *
 * Drain semantics (preserved verbatim):
 *   - `beginShutdownDrain()` flips an internal flag callers can read.
 *   - `awaitDrain(timeoutMs)` polls every 250ms until the count reaches
 *     zero or the deadline passes. Negative timeouts are clamped to 0.
 *
 * The registry intentionally stays out of provider-specific concerns
 * (codex thread cache, claude session source, etc.). It tracks generic
 * runs keyed by `runKey` and delegates claude-specific bookkeeping to
 * the injected `ClaudeSessionRegistry`.
 */

import type { ClaudeSessionRegistry } from '../providers/claude/claudeSessionRegistry.js';
import type { AgentFlavor } from '../../types.js';

/** A live provider run as recorded in the registry. */
export interface ActiveRun {
  controller: AbortController;
  projectId: string;
  chatId?: string;
  startedAt: number;
  agent: AgentFlavor;
  model?: string;
  modelReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh';
  completed: Promise<void>;
}

/** Input shape for the stale-run handler callback. */
export interface StaleRunCleanupInput {
  projectId: string;
  chatId?: string;
  model?: string;
  agent: AgentFlavor;
  runKey: string;
  ageMs: number;
  reason: string;
}

/** Host-side dependencies wired into the registry at construction. */
export interface ActiveRunRegistryDeps {
  /** Provider-specific run bookkeeping for Claude. */
  claudeSessionRegistry: ClaudeSessionRegistry;
  /** Wall-clock threshold past which a run is considered stale. */
  staleTimeoutMs: number;
  /** Host callback invoked once per stale run during cleanup. */
  handleStaleRunCleanup(input: StaleRunCleanupInput): Promise<void>;
}

/**
 * Build a run-key for the (projectId, chatId) tuple. Verbatim port of the
 * helper that lived in runtimeCore.ts.
 */
export function buildRunKey(projectId: string, chatId?: string): string {
  if (chatId && chatId.trim().length > 0) {
    return `${projectId}:${chatId.trim()}`;
  }
  return `${projectId}:__default__`;
}

/**
 * Predicate matching run-keys that belong to `projectId`. Returns true for
 * the default scope or any run-key prefixed with `${projectId}:`.
 */
export function isProjectRunKey(runKey: string, projectId: string): boolean {
  return runKey === `${projectId}:__default__` || runKey.startsWith(`${projectId}:`);
}

export class ActiveRunRegistry {
  private readonly runs = new Map<string, ActiveRun>();
  private draining = false;

  constructor(private readonly deps: ActiveRunRegistryDeps) {}

  // ---------------------------------------------------------------------
  // Map accessors
  // ---------------------------------------------------------------------

  set(runKey: string, run: ActiveRun): void {
    this.runs.set(runKey, run);
  }

  get(runKey: string): ActiveRun | undefined {
    return this.runs.get(runKey);
  }

  has(runKey: string): boolean {
    return this.runs.has(runKey);
  }

  delete(runKey: string): boolean {
    return this.runs.delete(runKey);
  }

  keys(): IterableIterator<string> {
    return this.runs.keys();
  }

  // ---------------------------------------------------------------------
  // Drain lifecycle
  // ---------------------------------------------------------------------

  beginShutdownDrain(): void {
    this.draining = true;
  }

  isDraining(): boolean {
    return this.draining;
  }

  async awaitDrain(timeoutMs: number): Promise<void> {
    const deadline = Date.now() + Math.max(0, timeoutMs);
    while (Date.now() <= deadline) {
      if (this.getActiveRunCount() === 0) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  }

  getActiveRunCount(): number {
    return this.runs.size + this.deps.claudeSessionRegistry.activeRunCount();
  }

  // ---------------------------------------------------------------------
  // Abort / cleanup
  // ---------------------------------------------------------------------

  abortSessionRuns(sessionId: string, chatId?: string): void {
    this.deps.claudeSessionRegistry.abortSessionRuns({ sessionId, chatId });
    const scopedRunKey = typeof chatId === 'string' && chatId.trim().length > 0
      ? buildRunKey(sessionId, chatId)
      : null;
    for (const [runKey, run] of this.runs.entries()) {
      if (scopedRunKey) {
        if (runKey !== scopedRunKey) {
          continue;
        }
      } else if (!isProjectRunKey(runKey, sessionId)) {
        continue;
      }
      if (!run.controller.signal.aborted) {
        run.controller.abort();
      }
      this.runs.delete(runKey);
    }
  }

  async cleanupStaleRuns(reason: string): Promise<void> {
    await this.deps.claudeSessionRegistry.cleanupStaleRuns(
      this.deps.staleTimeoutMs,
      async ({ runKey, run, ageMs }) => this.deps.handleStaleRunCleanup({
        projectId: run.sessionId,
        chatId: run.chatId,
        model: run.model,
        agent: 'claude',
        runKey,
        ageMs,
        reason,
      }),
    );

    const now = Date.now();
    const staleRuns: Array<{ runKey: string; run: ActiveRun; ageMs: number }> = [];
    for (const [runKey, run] of this.runs.entries()) {
      const ageMs = now - run.startedAt;
      if (ageMs <= this.deps.staleTimeoutMs) {
        continue;
      }
      staleRuns.push({ runKey, run, ageMs });
    }

    for (const stale of staleRuns) {
      if (!stale.run.controller.signal.aborted) {
        stale.run.controller.abort();
      }
      this.runs.delete(stale.runKey);
      await this.deps.handleStaleRunCleanup({
        projectId: stale.run.projectId,
        chatId: stale.run.chatId,
        model: stale.run.model,
        agent: stale.run.agent,
        runKey: stale.runKey,
        ageMs: stale.ageMs,
        reason,
      });
    }
  }
}
