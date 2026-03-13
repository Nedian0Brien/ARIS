import type { SessionProtocolEnvelope } from '../../contracts/sessionProtocol.js';
import type {
  ProviderActionEvent,
  ProviderCliResult,
  ProviderCommandExecutor,
  ProviderLaunchCommand,
  ProviderPermissionRequest,
  ProviderResumeTarget,
  ProviderTextEvent,
  ProviderThreadIdSource,
} from '../../contracts/providerRuntime.js';
import type { PermissionDecision } from '../../../types.js';
import type { ClaudeSessionLaunchMode } from './claudeSessionContract.js';

export type { ClaudeRuntimeSession } from './claudeSessionContract.js';

export type ClaudeResumeTarget = ProviderResumeTarget;
export type ClaudeThreadIdSource = ProviderThreadIdSource;
export type ClaudeActionEvent = ProviderActionEvent;
export type ClaudePermissionRequest = ProviderPermissionRequest;
export type ClaudeCliResult = ProviderCliResult & {
  protocolEnvelopes?: SessionProtocolEnvelope[];
};

export type ClaudeTextEvent = ProviderTextEvent;

export type ClaudeLaunchCommand = ProviderLaunchCommand<'claude'> & {
  requiresPty: boolean;
  streamJson: true;
};

export type ClaudeCommandExecutor = (input: {
  command: ClaudeLaunchCommand;
  cwdHint?: string;
  signal?: AbortSignal;
  onAction?: (action: ClaudeActionEvent) => Promise<void>;
  onPermission?: (request: ClaudePermissionRequest) => Promise<PermissionDecision>;
  onText?: (event: ClaudeTextEvent) => Promise<void>;
}) => Promise<ClaudeCliResult>;

export type ClaudeTurnResult = {
  output: string;
  cwd: string;
  streamedActionsPersisted: boolean;
  inferredActions: ClaudeActionEvent[];
  threadId?: string;
  threadIdSource: ClaudeThreadIdSource;
  protocolEnvelopes?: SessionProtocolEnvelope[];
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
