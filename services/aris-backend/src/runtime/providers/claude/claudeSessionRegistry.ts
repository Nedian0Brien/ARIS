import { ClaudeSessionController } from './claudeSessionController.js';
import type { ClaudeRunLifecycleMeta, ClaudeRunScope } from './types.js';
import type { ClaudeSessionHandle, ClaudeSessionOwner, ClaudeSessionOwnerMeta } from './claudeSessionContract.js';

function buildRunKey(sessionId: string, chatId?: string): string {
  if (chatId && chatId.trim().length > 0) {
    return `${sessionId}:${chatId.trim()}`;
  }
  return `${sessionId}:__default__`;
}

function isSessionRunKey(runKey: string, sessionId: string): boolean {
  return runKey === `${sessionId}:__default__` || runKey.startsWith(`${sessionId}:`);
}

export class ClaudeSessionRegistry implements ClaudeSessionOwner {
  private readonly runs = new Map<string, ClaudeSessionController>();

  async start(meta: ClaudeSessionOwnerMeta, waitTimeoutMs: number): Promise<ClaudeSessionController> {
    const runKey = buildRunKey(meta.sessionId, meta.chatId);
    const existing = this.runs.get(runKey);
    if (existing) {
      existing.abort();
      await existing.waitForCompletion(waitTimeoutMs);
    }

    const controller = new ClaudeSessionController({
      ...meta,
      startedAt: meta.startedAt ?? Date.now(),
    });
    this.runs.set(runKey, controller);
    return controller;
  }

  finish(controller: ClaudeSessionHandle): void {
    controller.finish();
    const runKey = buildRunKey(controller.sessionId, controller.chatId);
    const current = this.runs.get(runKey);
    if (current === controller) {
      this.runs.delete(runKey);
    }
  }

  abortSessionRuns(scope: ClaudeRunScope): void {
    const scopedRunKey = scope.chatId && scope.chatId.trim().length > 0
      ? buildRunKey(scope.sessionId, scope.chatId)
      : null;
    for (const [runKey, run] of this.runs.entries()) {
      if (scopedRunKey) {
        if (runKey !== scopedRunKey) {
          continue;
        }
      } else if (!isSessionRunKey(runKey, scope.sessionId)) {
        continue;
      }
      run.abort();
      this.runs.delete(runKey);
    }
  }

  async cleanupStaleRuns(
    staleTimeoutMs: number,
    onStale: (input: { runKey: string; run: ClaudeSessionHandle; ageMs: number }) => Promise<void>,
  ): Promise<void> {
    const now = Date.now();
    const staleRuns: Array<{ runKey: string; run: ClaudeSessionController; ageMs: number }> = [];
    for (const [runKey, run] of this.runs.entries()) {
      const ageMs = now - run.startedAt;
      if (ageMs <= staleTimeoutMs) {
        continue;
      }
      staleRuns.push({ runKey, run, ageMs });
    }

    for (const stale of staleRuns) {
      stale.run.abort();
      this.runs.delete(stale.runKey);
      await onStale(stale);
    }
  }

  isRunning(scope: ClaudeRunScope): boolean {
    if (scope.chatId && scope.chatId.trim().length > 0) {
      return this.runs.has(buildRunKey(scope.sessionId, scope.chatId));
    }

    for (const runKey of this.runs.keys()) {
      if (isSessionRunKey(runKey, scope.sessionId)) {
        return true;
      }
    }
    return false;
  }
}
