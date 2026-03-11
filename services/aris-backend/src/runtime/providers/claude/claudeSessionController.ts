import { setTimeout as delay } from 'node:timers/promises';
import type { ClaudeRunLifecycleMeta } from './types.js';

export class ClaudeSessionController {
  readonly abortController = new AbortController();
  readonly sessionId: string;
  readonly chatId?: string;
  readonly startedAt: number;
  readonly model?: string;
  readonly completed: Promise<void>;

  private finished = false;
  private resolveCompleted!: () => void;

  constructor(meta: ClaudeRunLifecycleMeta) {
    this.sessionId = meta.sessionId;
    this.chatId = meta.chatId;
    this.startedAt = meta.startedAt;
    this.model = meta.model;
    this.completed = new Promise<void>((resolve) => {
      this.resolveCompleted = resolve;
    });
  }

  get signal(): AbortSignal {
    return this.abortController.signal;
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
