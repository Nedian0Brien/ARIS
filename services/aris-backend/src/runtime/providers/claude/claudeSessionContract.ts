import type { ProviderRuntimeSession, ProviderThreadIdSource } from '../../contracts/providerRuntime.js';

export const CLAUDE_SESSION_SOURCES = [
  'synthetic',
  'resume',
  'observed',
  'scanner',
  'hook',
] as const;
export const CLAUDE_SESSION_KEEPALIVE_STATES = [
  'active',
  'idle',
  'draining',
  'stopped',
] as const;
export const CLAUDE_SESSION_TURN_STATES = [
  'idle',
  'launching',
  'streaming',
  'waiting_permission',
  'completed',
  'aborted',
  'failed',
] as const;
export const CLAUDE_SESSION_ONE_TIME_FLAGS = [
  'synthetic-bootstrap',
  'resume-bootstrap',
  'session-start-hook',
] as const;

export type ClaudeRuntimeSession = ProviderRuntimeSession<'claude'>;
export type ClaudeSessionScope = {
  sessionId: string;
  chatId?: string;
};

export type ClaudeSessionLaunchMode = 'local' | 'remote';
export type ClaudeSessionStatus = 'running' | 'finished';
export type ClaudeSessionSource = typeof CLAUDE_SESSION_SOURCES[number];
export type ClaudeSessionKeepAliveState = typeof CLAUDE_SESSION_KEEPALIVE_STATES[number];
export type ClaudeSessionTurnState = typeof CLAUDE_SESSION_TURN_STATES[number];
export type ClaudeSessionOneTimeFlag = typeof CLAUDE_SESSION_ONE_TIME_FLAGS[number];

export type ClaudeSessionSnapshot = {
  scope: ClaudeSessionScope;
  startedAt: number;
  model?: string;
  launchMode: ClaudeSessionLaunchMode;
  status: ClaudeSessionStatus;
};

export type ClaudeSessionIdentity = {
  syntheticId?: string;
  observedId?: string;
  activeThreadId?: string;
  sessionSource: ClaudeSessionSource;
  threadIdSource?: ProviderThreadIdSource;
};

export type ClaudeSessionCallbacks = {
  onSessionObserved?: (identity: ClaudeSessionIdentity) => void | Promise<void>;
  onSessionCleared?: (scope: ClaudeSessionScope) => void | Promise<void>;
  onTurnStateChanged?: (state: ClaudeSessionTurnState, scope: ClaudeSessionScope) => void | Promise<void>;
};

export type ClaudeSessionOneTimeFlags = Partial<Record<ClaudeSessionOneTimeFlag, boolean>>;

export interface ClaudeSessionContract {
  scope: ClaudeSessionScope;
  launchMode: ClaudeSessionLaunchMode;
  keepAliveState: ClaudeSessionKeepAliveState;
  sessionSource: ClaudeSessionSource;
  turnState: ClaudeSessionTurnState;
  identity: ClaudeSessionIdentity;
  oneTimeFlags: ClaudeSessionOneTimeFlags;
  callbacks: ClaudeSessionCallbacks;
}

export interface ClaudeSessionStateOwner {
  readonly sessionId: string;
  readonly chatId?: string;
  readonly launchMode: ClaudeSessionLaunchMode;
  snapshot(): ClaudeSessionContract;
  getActiveThreadId(): string | undefined;
  resolvePreferredThreadId(requestedThreadId?: string, storedThreadId?: string): string | undefined;
  observeThreadId(threadId: string, source?: Extract<ClaudeSessionSource, 'observed' | 'scanner' | 'hook'>): void;
  restoreThreadId(threadId: string, source?: Extract<ClaudeSessionSource, 'resume' | 'observed' | 'scanner'>): void;
  clearActiveThread(): void;
  consumeOneTimeFlag(flag: ClaudeSessionOneTimeFlag): boolean;
  beginTurn(): void;
  markTurnState(state: ClaudeSessionTurnState): void;
  completeTurn(): void;
  abortTurn(): void;
  failTurn(): void;
}

export type ClaudeSessionOwnerMeta = ClaudeSessionScope & {
  startedAt?: number;
  model?: string;
  launchMode?: ClaudeSessionLaunchMode;
  callbacks?: ClaudeSessionCallbacks;
};

export interface ClaudeSessionHandle {
  readonly sessionId: string;
  readonly chatId?: string;
  readonly startedAt: number;
  readonly model?: string;
  readonly launchMode: ClaudeSessionLaunchMode;
  readonly signal: AbortSignal;
  readonly session: ClaudeSessionStateOwner;
  abort(): void;
  finish(): void;
  waitForCompletion(timeoutMs: number): Promise<void>;
  snapshot(): ClaudeSessionSnapshot;
}

export interface ClaudeSessionOwner {
  start(meta: ClaudeSessionOwnerMeta, waitTimeoutMs: number): Promise<ClaudeSessionHandle>;
  get(scope: ClaudeSessionScope): ClaudeSessionStateOwner | undefined;
  finish(handle: ClaudeSessionHandle): void;
  abortSessionRuns(scope: ClaudeSessionScope): void;
  cleanupStaleRuns(
    staleTimeoutMs: number,
    onStale: (input: { runKey: string; run: ClaudeSessionHandle; ageMs: number }) => Promise<void>,
  ): Promise<void>;
  isRunning(scope: ClaudeSessionScope): boolean;
}
