import { runClaudeCommand } from './claudeLauncher.js';
import { buildClaudeResumeTarget, resolveClaudeThreadId } from './claudeSessionSource.js';
import type { ClaudeSessionStateOwner } from './claudeSessionContract.js';
import type { ClaudeCommandExecutor, ClaudeRuntimeSession, ClaudeTurnResult } from './types.js';

function extractObservedThreadIdFromError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const candidate = (error as { threadId?: unknown }).threadId;
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

export async function runClaudeTurn(input: {
  session: ClaudeRuntimeSession;
  sessionOwner?: ClaudeSessionStateOwner;
  prompt: string;
  chatId?: string;
  preferredThreadId?: string;
  syntheticThreadId?: string;
  model?: string;
  signal?: AbortSignal;
  onAction?: Parameters<ClaudeCommandExecutor>[0]['onAction'];
  onPermission?: Parameters<ClaudeCommandExecutor>[0]['onPermission'];
  executeCommand: ClaudeCommandExecutor;
}): Promise<ClaudeTurnResult> {
  input.sessionOwner?.beginTurn();
  const handlePermission = input.onPermission;
  const { resumeTarget, actionThreadId, threadIdSource: initialThreadIdSource } = buildClaudeResumeTarget(
    input.preferredThreadId,
    input.session.id,
    input.chatId,
    input.syntheticThreadId,
  );

  const result = await runClaudeCommand({
    prompt: input.prompt,
    approvalPolicy: input.session.metadata.approvalPolicy,
    model: input.model,
    cwdHint: input.session.metadata.path,
    signal: input.signal,
    resumeTarget,
    onAction: input.onAction
      ? async (action) => {
        input.sessionOwner?.markTurnState('streaming');
        await input.onAction?.(action);
      }
      : undefined,
    onPermission: handlePermission
      ? async (request) => {
        input.sessionOwner?.markTurnState('waiting_permission');
        const decision = await handlePermission(request);
        if (!input.signal?.aborted) {
          input.sessionOwner?.markTurnState('streaming');
        }
        return decision;
      }
      : undefined,
    executeCommand: input.executeCommand,
  }).catch((error) => {
    const observedThreadId = extractObservedThreadIdFromError(error);
    if (observedThreadId) {
      input.sessionOwner?.observeThreadId(observedThreadId, 'observed');
    }
    throw error;
  });

  const resolvedThread = resolveClaudeThreadId({
    observedThreadId: result.threadId,
    actionThreadId,
    initialSource: initialThreadIdSource,
  });
  if (resolvedThread.threadId && resolvedThread.threadIdSource === 'observed') {
    input.sessionOwner?.observeThreadId(resolvedThread.threadId, 'observed');
  } else if (resolvedThread.threadId && resolvedThread.threadIdSource === 'resume') {
    input.sessionOwner?.restoreThreadId(resolvedThread.threadId, initialThreadIdSource === 'resume' ? 'resume' : 'observed');
  }
  input.sessionOwner?.completeTurn();

  return {
    output: result.output,
    cwd: result.cwd,
    streamedActionsPersisted: result.streamedActionsPersisted,
    inferredActions: result.inferredActions,
    threadId: resolvedThread.threadId,
    threadIdSource: resolvedThread.threadIdSource,
    ...(result.protocolEnvelopes ? { protocolEnvelopes: result.protocolEnvelopes } : {}),
  };
}
