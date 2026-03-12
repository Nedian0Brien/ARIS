import type { GeminiSessionSnapshot, GeminiThreadIdSource } from './types.js';

function normalizeThreadId(threadId: string | undefined): string | undefined {
  if (typeof threadId !== 'string') {
    return undefined;
  }
  const trimmed = threadId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class GeminiSession {
  readonly sessionId: string;
  readonly chatId?: string;

  private observedThreadId?: string;
  private activeThreadId?: string;
  private threadIdSource?: GeminiThreadIdSource;

  constructor(input: { sessionId: string; chatId?: string }) {
    this.sessionId = input.sessionId;
    this.chatId = input.chatId;
  }

  snapshot(): GeminiSessionSnapshot {
    return {
      scope: {
        sessionId: this.sessionId,
        ...(this.chatId ? { chatId: this.chatId } : {}),
      },
      ...(this.observedThreadId ? { observedThreadId: this.observedThreadId } : {}),
      ...(this.getActiveThreadId() ? { activeThreadId: this.getActiveThreadId() } : {}),
      ...(this.threadIdSource ? { threadIdSource: this.threadIdSource } : {}),
    };
  }

  getActiveThreadId(): string | undefined {
    return this.observedThreadId ?? this.activeThreadId;
  }

  resolvePreferredThreadId(requestedThreadId?: string, storedThreadId?: string): string | undefined {
    const requested = normalizeThreadId(requestedThreadId);
    if (requested) {
      return requested;
    }

    const active = this.getActiveThreadId();
    if (active) {
      return active;
    }

    const stored = normalizeThreadId(storedThreadId);
    if (stored) {
      this.restoreThreadId(stored, 'resume');
      return stored;
    }

    return undefined;
  }

  observeThreadId(threadId: string): void {
    const normalized = normalizeThreadId(threadId);
    if (!normalized) {
      return;
    }

    this.observedThreadId = normalized;
    this.activeThreadId = normalized;
    this.threadIdSource = 'observed';
  }

  restoreThreadId(threadId: string, source: Extract<GeminiThreadIdSource, 'resume' | 'observed'> = 'resume'): void {
    const normalized = normalizeThreadId(threadId);
    if (!normalized) {
      return;
    }

    this.activeThreadId = normalized;
    if (source === 'observed') {
      this.observedThreadId = normalized;
      this.threadIdSource = 'observed';
      return;
    }

    this.threadIdSource = 'resume';
  }

  clearThreadId(): void {
    this.observedThreadId = undefined;
    this.activeThreadId = undefined;
    this.threadIdSource = undefined;
  }
}
