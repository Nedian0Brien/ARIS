import { buildClaudeSessionId, chooseClaudePreferredThreadId } from './claudeSessionSource.js';
import { isClaudeMissingConversationError, isClaudeSessionInUseError } from './claudeLauncher.js';
import { runClaudeTurn } from './claudeRuntime.js';
import type { ClaudeSessionStateOwner } from './claudeSessionContract.js';
import type {
  ClaudeActionEvent,
  ClaudeCommandExecutor,
  ClaudePermissionRequest,
  ClaudeRuntimeSession,
  ClaudeTurnResult,
} from './types.js';
import type { PermissionDecision } from '../../../types.js';
import type { RuntimeMessage } from '../../../types.js';

export function buildClaudeActionThreadId(
  requestedThreadId: string | undefined,
  storedThreadId: string | undefined,
  sessionId: string,
  chatId?: string,
): string {
  return requestedThreadId ?? storedThreadId ?? buildClaudeSessionId(sessionId, chatId);
}

export function recoverClaudeThreadIdFromMessages(
  messages: Array<Pick<RuntimeMessage, 'meta'>>,
  chatId?: string,
): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (chatId) {
      const rawChatId = message?.meta?.chatId;
      const messageChatId = typeof rawChatId === 'string' ? rawChatId.trim() : '';
      if (messageChatId !== chatId) {
        continue;
      }
    }

    const messageAgent = typeof message?.meta?.agent === 'string'
      ? message.meta.agent.trim()
      : '';
    if (messageAgent !== 'claude') {
      continue;
    }

    const source = typeof message?.meta?.threadIdSource === 'string'
      ? message.meta.threadIdSource.trim()
      : '';
    const providerThreadId = typeof message?.meta?.claudeSessionId === 'string'
      ? message.meta.claudeSessionId.trim()
      : '';
    if (providerThreadId && source !== 'synthetic') {
      return providerThreadId;
    }
    const threadId = typeof message?.meta?.threadId === 'string'
      ? message.meta.threadId.trim()
      : '';
    if (threadId && source && source !== 'synthetic') {
      return threadId;
    }
  }

  return undefined;
}

export async function runClaudeProviderTurn(input: {
  session: ClaudeRuntimeSession;
  sessionOwner?: ClaudeSessionStateOwner;
  prompt: string;
  chatId?: string;
  requestedThreadId?: string;
  storedThreadId?: string;
  model?: string;
  signal?: AbortSignal;
  onAction?: (action: ClaudeActionEvent, meta: { threadId: string }) => Promise<void>;
  onPermission?: (request: ClaudePermissionRequest, meta: { threadId: string }) => Promise<PermissionDecision>;
  executeCommand: ClaudeCommandExecutor;
}): Promise<ClaudeTurnResult & { actionThreadId?: string; messageMeta: Record<string, unknown> }> {
  const preferredThreadId = input.sessionOwner?.resolvePreferredThreadId(
    input.requestedThreadId,
    input.storedThreadId,
  ) ?? chooseClaudePreferredThreadId({
    requestedThreadId: input.requestedThreadId,
    activeThreadId: input.sessionOwner?.getActiveThreadId(),
    storedThreadId: input.storedThreadId,
  });
  const handlePermission = input.onPermission;
  const executeTurn = async (attemptedThreadId?: string, syntheticThreadId?: string) => {
    const actionThreadId = attemptedThreadId ?? syntheticThreadId ?? buildClaudeSessionId(input.session.id, input.chatId);
    const result = await runClaudeTurn({
      session: input.session,
      sessionOwner: input.sessionOwner,
      prompt: input.prompt,
      chatId: input.chatId,
      preferredThreadId: attemptedThreadId,
      syntheticThreadId,
      model: input.model,
      signal: input.signal,
      onAction: input.onAction
        ? async (action) => input.onAction?.(action, { threadId: actionThreadId })
        : undefined,
      onPermission: handlePermission
        ? async (request) => handlePermission(request, { threadId: actionThreadId })
        : undefined,
      executeCommand: input.executeCommand,
    });
    return { actionThreadId, result };
  };

  const initialSyntheticThreadId = preferredThreadId
    ? undefined
    : input.sessionOwner?.getSyntheticThreadId();

  const executed = await executeTurn(preferredThreadId, initialSyntheticThreadId).catch(async (error) => {
    if (!preferredThreadId && isClaudeSessionInUseError(error)) {
      const rotatedSyntheticThreadId = input.sessionOwner?.rotateSyntheticThreadId()
        ?? buildClaudeSessionId(input.session.id, input.chatId, `retry:${Date.now()}`);
      return executeTurn(undefined, rotatedSyntheticThreadId);
    }
    if (!preferredThreadId || !isClaudeMissingConversationError(error)) {
      if (input.signal?.aborted) {
        input.sessionOwner?.abortTurn();
      } else {
        input.sessionOwner?.failTurn();
      }
      throw error;
    }
    input.sessionOwner?.clearActiveThread();
    return executeTurn(undefined, input.sessionOwner?.getSyntheticThreadId());
  });

  const shouldPersistClaudeSessionId = executed.result.threadId && executed.result.threadIdSource !== 'synthetic';
  return {
    ...executed.result,
    actionThreadId: executed.actionThreadId,
    messageMeta: shouldPersistClaudeSessionId
      ? {
        claudeSessionId: executed.result.threadId,
        threadIdSource: executed.result.threadIdSource,
      }
      : executed.result.threadIdSource
        ? { threadIdSource: executed.result.threadIdSource }
        : {},
  };
}
