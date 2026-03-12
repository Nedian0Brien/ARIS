import { buildClaudeSessionId } from './claudeSessionSource.js';
import type {
  ClaudeSessionCallbacks,
  ClaudeSessionContract,
  ClaudeSessionKeepAliveState,
  ClaudeSessionOneTimeFlag,
  ClaudeSessionScope,
  ClaudeSessionSource,
  ClaudeSessionStateOwner,
  ClaudeSessionTurnState,
  ClaudeSessionOwnerMeta,
} from './claudeSessionContract.js';

function normalizeThreadId(threadId: string | undefined): string | undefined {
  if (typeof threadId !== 'string') {
    return undefined;
  }
  const trimmed = threadId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export class ClaudeSession implements ClaudeSessionStateOwner {
  readonly sessionId: string;
  readonly chatId?: string;

  private readonly callbacks: ClaudeSessionCallbacks;
  private readonly syntheticId: string;
  private launchModeValue: ClaudeSessionContract['launchMode'];
  private keepAliveState: ClaudeSessionKeepAliveState = 'idle';
  private sessionSource: ClaudeSessionSource = 'synthetic';
  private turnState: ClaudeSessionTurnState = 'idle';
  private observedThreadId?: string;
  private activeThreadId?: string;
  private threadIdSource?: ClaudeSessionContract['identity']['threadIdSource'];
  private oneTimeFlags: ClaudeSessionContract['oneTimeFlags'] = {
    'synthetic-bootstrap': true,
    'resume-bootstrap': true,
    'session-start-hook': true,
  };

  constructor(meta: ClaudeSessionOwnerMeta) {
    this.sessionId = meta.sessionId;
    this.chatId = meta.chatId;
    this.callbacks = meta.callbacks ?? {};
    this.syntheticId = buildClaudeSessionId(meta.sessionId, meta.chatId);
    this.launchModeValue = meta.launchMode ?? 'local';
  }

  get launchMode(): ClaudeSessionContract['launchMode'] {
    return this.launchModeValue;
  }

  snapshot(): ClaudeSessionContract {
    return {
      scope: {
        sessionId: this.sessionId,
        ...(this.chatId ? { chatId: this.chatId } : {}),
      },
      launchMode: this.launchModeValue,
      keepAliveState: this.keepAliveState,
      sessionSource: this.sessionSource,
      turnState: this.turnState,
      identity: {
        syntheticId: this.syntheticId,
        ...(this.observedThreadId ? { observedId: this.observedThreadId } : {}),
        ...(this.getActiveThreadId() ? { activeThreadId: this.getActiveThreadId() } : {}),
        sessionSource: this.sessionSource,
        ...(this.threadIdSource ? { threadIdSource: this.threadIdSource } : {}),
      },
      oneTimeFlags: { ...this.oneTimeFlags },
      callbacks: this.callbacks,
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
      this.consumeOneTimeFlag('resume-bootstrap');
      return stored;
    }

    return undefined;
  }

  observeThreadId(threadId: string, source: Extract<ClaudeSessionSource, 'observed' | 'scanner' | 'hook'> = 'observed'): void {
    const normalized = normalizeThreadId(threadId);
    if (!normalized) {
      return;
    }
    this.observedThreadId = normalized;
    this.activeThreadId = normalized;
    this.sessionSource = source;
    this.threadIdSource = 'observed';
    void this.callbacks.onSessionObserved?.(this.snapshot().identity);
  }

  restoreThreadId(threadId: string, source: Extract<ClaudeSessionSource, 'resume' | 'observed' | 'scanner'> = 'resume'): void {
    const normalized = normalizeThreadId(threadId);
    if (!normalized) {
      return;
    }
    this.activeThreadId = normalized;
    if (source === 'observed') {
      this.observedThreadId = normalized;
      this.threadIdSource = 'observed';
    } else {
      this.threadIdSource = 'resume';
    }
    this.sessionSource = source;
  }

  clearActiveThread(): void {
    this.activeThreadId = undefined;
    this.observedThreadId = undefined;
    this.sessionSource = 'synthetic';
    this.threadIdSource = 'synthetic';
    void this.callbacks.onSessionCleared?.({
      sessionId: this.sessionId,
      ...(this.chatId ? { chatId: this.chatId } : {}),
    });
  }

  consumeOneTimeFlag(flag: ClaudeSessionOneTimeFlag): boolean {
    if (!this.oneTimeFlags[flag]) {
      return false;
    }
    this.oneTimeFlags = {
      ...this.oneTimeFlags,
      [flag]: false,
    };
    return true;
  }

  beginTurn(): void {
    this.keepAliveState = 'active';
    this.turnState = 'launching';
  }

  markTurnState(state: ClaudeSessionTurnState): void {
    this.turnState = state;
    if (state === 'aborted') {
      this.keepAliveState = 'draining';
    } else if (state === 'completed' || state === 'failed') {
      this.keepAliveState = 'idle';
    } else {
      this.keepAliveState = 'active';
    }
    void this.callbacks.onTurnStateChanged?.(state, {
      sessionId: this.sessionId,
      ...(this.chatId ? { chatId: this.chatId } : {}),
    });
  }

  completeTurn(): void {
    this.markTurnState('completed');
  }

  abortTurn(): void {
    this.markTurnState('aborted');
  }

  failTurn(): void {
    this.markTurnState('failed');
  }

  updateLaunchMode(mode: ClaudeSessionContract['launchMode']): void {
    this.launchModeValue = mode;
  }

  getSyntheticThreadId(): string {
    this.consumeOneTimeFlag('synthetic-bootstrap');
    return this.syntheticId;
  }
}
