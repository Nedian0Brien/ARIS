import type { ProviderRuntimeSession, ProviderThreadIdSource } from '../../contracts/providerRuntime.js';

export type ClaudeSessionContract = ProviderRuntimeSession<'claude'>;
export type ClaudeSessionScope = {
  sessionId: string;
  chatId?: string;
};

export type ClaudeSessionLaunchMode = 'local' | 'remote';
export type ClaudeSessionStatus = 'running' | 'finished';

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
  threadIdSource?: ProviderThreadIdSource;
};

export type ClaudeSessionOwnerMeta = ClaudeSessionScope & {
  startedAt?: number;
  model?: string;
  launchMode?: ClaudeSessionLaunchMode;
};

export interface ClaudeSessionHandle {
  readonly sessionId: string;
  readonly chatId?: string;
  readonly startedAt: number;
  readonly model?: string;
  readonly launchMode: ClaudeSessionLaunchMode;
  readonly signal: AbortSignal;
  abort(): void;
  finish(): void;
  waitForCompletion(timeoutMs: number): Promise<void>;
  snapshot(): ClaudeSessionSnapshot;
}

export interface ClaudeSessionOwner {
  start(meta: ClaudeSessionOwnerMeta, waitTimeoutMs: number): Promise<ClaudeSessionHandle>;
  finish(handle: ClaudeSessionHandle): void;
  abortSessionRuns(scope: ClaudeSessionScope): void;
  cleanupStaleRuns(
    staleTimeoutMs: number,
    onStale: (input: { runKey: string; run: ClaudeSessionHandle; ageMs: number }) => Promise<void>,
  ): Promise<void>;
  isRunning(scope: ClaudeSessionScope): boolean;
}
