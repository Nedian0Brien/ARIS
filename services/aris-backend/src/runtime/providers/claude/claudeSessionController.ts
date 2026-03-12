import { setTimeout as delay } from 'node:timers/promises';
import type { ClaudeRunLifecycleMeta } from './types.js';
import type { ClaudeSessionHandle, ClaudeSessionLaunchMode, ClaudeSessionSnapshot, ClaudeSessionStatus } from './claudeSessionContract.js';

export class ClaudeSessionController implements ClaudeSessionHandle {
  readonly abortController = new AbortController();
  readonly sessionId: string;
  readonly chatId?: string;
  readonly startedAt: number;
  readonly model?: string;
  readonly launchMode: ClaudeSessionLaunchMode;
  readonly completed: Promise<void>;

  private finished = false;
  private resolveCompleted!: () => void;

  constructor(meta: ClaudeRunLifecycleMeta) {
    this.sessionId = meta.sessionId;
    this.chatId = meta.chatId;
    this.startedAt = meta.startedAt;
    this.model = meta.model;
    this.launchMode = meta.launchMode ?? 'local';
    this.completed = new Promise<void>((resolve) => {
      this.resolveCompleted = resolve;
    });
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
  }

  snapshot(): ClaudeSessionSnapshot {
    const status: ClaudeSessionStatus = this.finished ? 'finished' : 'running';
    return {
      scope: {
        sessionId: this.sessionId,
        ...(this.chatId ? { chatId: this.chatId } : {}),
      },
      startedAt: this.startedAt,
      ...(this.model ? { model: this.model } : {}),
      launchMode: this.launchMode,
      status,
    };
  }

  abort(): void {
    if (!this.abortController.signal.aborted) {
      this.abortController.abort();
    }
  }

  finish(): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    this.resolveCompleted();
  }

  async waitForCompletion(timeoutMs: number): Promise<void> {
    await Promise.race([
      this.completed,
      delay(timeoutMs).then(() => undefined),
    ]);
  }
}
