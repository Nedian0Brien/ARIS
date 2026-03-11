import type { ApprovalPolicy, RuntimeSession } from '../../../types.js';

export type ClaudeResumeTarget = {
  id: string;
  mode?: 'resume' | 'session-id';
};

export type ClaudeActionEvent = {
  actionType: 'file_read' | 'file_write' | 'file_list' | 'command_execution';
  title: string;
  callId?: string;
  command?: string;
  path?: string;
  output?: string;
  additions: number;
  deletions: number;
  hasDiffSignal: boolean;
};

export type ClaudeCliResult = {
  output: string;
  cwd: string;
  inferredActions: ClaudeActionEvent[];
  streamedActionsPersisted: boolean;
  threadId?: string;
};

export type ClaudeRunCli = (input: {
  prompt: string;
  approvalPolicy: ApprovalPolicy;
  model?: string;
  cwdHint?: string;
  signal?: AbortSignal;
  resumeTarget?: ClaudeResumeTarget;
  onAction?: (action: ClaudeActionEvent) => Promise<void>;
}) => Promise<ClaudeCliResult>;

export type ClaudeTurnResult = {
  output: string;
  cwd: string;
  streamedActionsPersisted: boolean;
  inferredActions: ClaudeActionEvent[];
  threadId?: string;
};

export type ClaudeRuntimeSession = Pick<RuntimeSession, 'id' | 'metadata'>;
