import type {
  ProviderActionEvent,
  ProviderCliResult,
  ProviderCommandExecutor,
  ProviderLaunchCommand,
  ProviderResumeTarget,
  ProviderThreadIdSource,
} from '../../contracts/providerRuntime.js';
import type { ClaudeSessionLaunchMode } from './claudeSessionContract.js';

export type { ClaudeRuntimeSession } from './claudeSessionContract.js';

export type ClaudeResumeTarget = ProviderResumeTarget;
export type ClaudeThreadIdSource = ProviderThreadIdSource;
export type ClaudeActionEvent = ProviderActionEvent;
export type ClaudeCliResult = ProviderCliResult;

export type ClaudeLaunchCommand = ProviderLaunchCommand<'claude'> & {
  requiresPty: boolean;
  streamJson: true;
};

export type ClaudeCommandExecutor = ProviderCommandExecutor<ClaudeLaunchCommand>;

export type ClaudeTurnResult = {
  output: string;
  cwd: string;
  streamedActionsPersisted: boolean;
  inferredActions: ClaudeActionEvent[];
  threadId?: string;
  threadIdSource: ClaudeThreadIdSource;
};

export type ClaudeRunLifecycleMeta = {
  sessionId: string;
  chatId?: string;
  startedAt: number;
  model?: string;
  launchMode?: ClaudeSessionLaunchMode;
};

export type ClaudeRunScope = {
  sessionId: string;
  chatId?: string;
};
