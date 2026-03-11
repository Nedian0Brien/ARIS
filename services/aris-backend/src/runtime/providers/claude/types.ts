import type { RuntimeSession } from '../../../types.js';

export type ClaudeResumeTarget = {
  id: string;
  mode?: 'resume' | 'session-id';
};

export type ClaudeThreadIdSource = 'resume' | 'observed' | 'synthetic';

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

export type ClaudeLaunchCommand = {
  command: 'claude';
  args: string[];
  requiresPty: boolean;
  streamJson: true;
  fallbackArgs?: string[];
  retryArgsOnFailure?: string[];
};

export type ClaudeCommandExecutor = (input: {
  command: ClaudeLaunchCommand;
  cwdHint?: string;
  signal?: AbortSignal;
  onAction?: (action: ClaudeActionEvent) => Promise<void>;
}) => Promise<ClaudeCliResult>;

export type ClaudeTurnResult = {
  output: string;
  cwd: string;
  streamedActionsPersisted: boolean;
  inferredActions: ClaudeActionEvent[];
  threadId?: string;
  threadIdSource: ClaudeThreadIdSource;
};

export type ClaudeRuntimeSession = Pick<RuntimeSession, 'id' | 'metadata'>;

export type ClaudeRunLifecycleMeta = {
  sessionId: string;
  chatId?: string;
  startedAt: number;
  model?: string;
};

export type ClaudeRunScope = {
  sessionId: string;
  chatId?: string;
};
