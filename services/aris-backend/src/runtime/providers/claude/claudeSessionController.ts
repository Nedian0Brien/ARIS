import { setTimeout as delay } from 'node:timers/promises';
import type { ClaudeRunLifecycleMeta } from './types.js';
import { ClaudeSession } from './claudeSession.js';
import type { ClaudeSessionHandle, ClaudeSessionLaunchMode, ClaudeSessionSnapshot, ClaudeSessionStatus } from './claudeSessionContract.js';

export class ClaudeSessionController implements ClaudeSessionHandle {
  readonly abortController = new AbortController();
  readonly sessionId: string;
  readonly chatId?: string;
  readonly startedAt: number;
  readonly model?: string;
  readonly launchMode: ClaudeSessionLaunchMode;
  readonly completed: Promise<void>;
  readonly session: ClaudeSession;

  private finished = false;
  private resolveCompleted!: () => void;

  constructor(session: ClaudeSession, meta: ClaudeRunLifecycleMeta) {
    this.session = session;
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
    this.session.abortTurn();
    if (!this.abortController.signal.aborted) {
      this.abortController.abort();
    }
  }

  finish(): void {
    if (this.finished) {
      return;
    }
    this.finished = true;
    if (this.session.snapshot().turnState === 'launching' || this.session.snapshot().turnState === 'streaming') {
      this.session.completeTurn();
    } else if (this.session.snapshot().keepAliveState === 'draining') {
      this.session.markTurnState('aborted');
    }
    this.resolveCompleted();
  }

  async waitForCompletion(timeoutMs: number): Promise<void> {
    await Promise.race([
      this.completed,
      delay(timeoutMs).then(() => undefined),
    ]);
  }
}
