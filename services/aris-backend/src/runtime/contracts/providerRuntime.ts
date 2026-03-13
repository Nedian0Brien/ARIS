import type { AgentFlavor, ApprovalPolicy, PermissionDecision, PermissionRisk, RuntimeSession } from '../../types.js';
import type { SessionProtocolEnvelope } from './sessionProtocol.js';

export type ProviderRuntimeFlavor = Exclude<AgentFlavor, 'unknown'>;
export type ProviderActionType = 'file_read' | 'file_write' | 'file_list' | 'command_execution';
export type ProviderThreadIdSource = 'resume' | 'observed' | 'synthetic';
export type ProviderResumeTargetMode = 'resume' | 'session-id';
export const PROVIDER_RUNTIME_METHODS = [
  'sendTurn',
  'abortTurn',
  'recoverSession',
  'isRunning',
] as const;

export type ProviderResumeTarget = {
  id: string;
  mode?: ProviderResumeTargetMode;
};

export type ProviderPermissionRequest = {
  callId: string;
  approvalId?: string;
  command: string;
  reason: string;
  risk: PermissionRisk;
};

export type ProviderActionEvent = {
  actionType: ProviderActionType;
  title: string;
  callId?: string;
  command?: string;
  path?: string;
  output?: string;
  additions: number;
  deletions: number;
  hasDiffSignal: boolean;
};

export type ProviderTextEvent = {
  text: string;
  source: 'assistant' | 'result';
  threadId?: string;
  envelopes?: SessionProtocolEnvelope[];
};

export type ProviderCliResult = {
  output: string;
  cwd: string;
  inferredActions: ProviderActionEvent[];
  streamedActionsPersisted: boolean;
  threadId?: string;
};

export type ProviderLaunchCommand<TCommand extends string = string> = {
  command: TCommand;
  args: string[];
  requiresPty?: boolean;
  streamJson: boolean;
  fallbackArgs?: string[];
  retryArgsOnFailure?: string[];
};

export type ProviderCommandExecutor<TCommand extends ProviderLaunchCommand = ProviderLaunchCommand> = (input: {
  command: TCommand;
  cwdHint?: string;
  signal?: AbortSignal;
  onAction?: (action: ProviderActionEvent) => Promise<void>;
  onPermission?: (request: ProviderPermissionRequest) => Promise<PermissionDecision>;
  onText?: (event: ProviderTextEvent) => Promise<void>;
}) => Promise<ProviderCliResult>;

export type ProviderRuntimeSession<TFlavor extends ProviderRuntimeFlavor = ProviderRuntimeFlavor> = Pick<RuntimeSession, 'id'> & {
  metadata: Pick<RuntimeSession['metadata'], 'path' | 'approvalPolicy'> & {
    flavor: TFlavor;
    model?: string;
  };
};

export type ProviderLaunchRequest<TFlavor extends AgentFlavor = AgentFlavor> = {
  agent: TFlavor;
  prompt: string;
  approvalPolicy: ApprovalPolicy;
  model?: string;
  resumeTarget?: ProviderResumeTarget | string;
};

export type ProviderSessionScope = {
  sessionId: string;
  chatId?: string;
};

export type ProviderTurnRequest<TSession extends ProviderRuntimeSession = ProviderRuntimeSession> = {
  session: TSession;
  prompt: string;
  chatId?: string;
  requestedThreadId?: string;
  storedThreadId?: string;
  model?: string;
  signal?: AbortSignal;
  onAction?: (action: ProviderActionEvent, meta: { threadId: string }) => Promise<void>;
  onPermission?: (request: ProviderPermissionRequest, meta: { threadId: string }) => Promise<PermissionDecision>;
  onText?: (event: ProviderTextEvent, meta: { threadId: string }) => Promise<void>;
};

export type ProviderTurnResult = {
  output: string;
  cwd: string;
  streamedActionsPersisted: boolean;
  inferredActions: ProviderActionEvent[];
  threadId?: string;
  threadIdSource: ProviderThreadIdSource;
};

export type ProviderSessionRecovery<TSession extends ProviderRuntimeSession = ProviderRuntimeSession> = {
  session: TSession;
  chatId?: string;
  recoveredThreadId?: string;
  threadIdSource?: ProviderThreadIdSource;
  source: 'stored' | 'messages' | 'scanner' | 'none';
};

export interface ProviderRuntime<
  TSession extends ProviderRuntimeSession = ProviderRuntimeSession,
  TResult extends ProviderTurnResult = ProviderTurnResult,
> {
  readonly provider: TSession['metadata']['flavor'];
  sendTurn(input: ProviderTurnRequest<TSession>): Promise<TResult>;
  abortTurn(scope: ProviderSessionScope): Promise<void> | void;
  recoverSession(input: {
    session: TSession;
    chatId?: string;
    storedThreadId?: string;
  }): Promise<ProviderSessionRecovery<TSession>> | ProviderSessionRecovery<TSession>;
  isRunning(scope: ProviderSessionScope): boolean;
}
