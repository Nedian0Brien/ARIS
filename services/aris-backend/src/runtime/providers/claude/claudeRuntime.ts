import { runClaudeCommand } from './claudeLauncher.js';
import { buildClaudeResumeTarget, resolveClaudeThreadId } from './claudeSessionSource.js';
import type { ClaudeCommandExecutor, ClaudeRuntimeSession, ClaudeTurnResult } from './types.js';

export async function runClaudeTurn(input: {
  session: ClaudeRuntimeSession;
  prompt: string;
  chatId?: string;
  preferredThreadId?: string;
  model?: string;
  signal?: AbortSignal;
  onAction?: Parameters<ClaudeCommandExecutor>[0]['onAction'];
  executeCommand: ClaudeCommandExecutor;
}): Promise<ClaudeTurnResult> {
  const { resumeTarget, actionThreadId, threadIdSource: initialThreadIdSource } = buildClaudeResumeTarget(
    input.preferredThreadId,
    input.session.id,
    input.chatId,
  );

  const result = await runClaudeCommand({
    prompt: input.prompt,
    approvalPolicy: input.session.metadata.approvalPolicy,
    model: input.model,
    cwdHint: input.session.metadata.path,
    signal: input.signal,
    resumeTarget,
    onAction: input.onAction,
    executeCommand: input.executeCommand,
  });

  const resolvedThread = resolveClaudeThreadId({
    observedThreadId: result.threadId,
    actionThreadId,
    initialSource: initialThreadIdSource,
  });

  return {
    output: result.output,
    cwd: result.cwd,
    streamedActionsPersisted: result.streamedActionsPersisted,
    inferredActions: result.inferredActions,
    threadId: resolvedThread.threadId,
    threadIdSource: resolvedThread.threadIdSource,
  };
}
