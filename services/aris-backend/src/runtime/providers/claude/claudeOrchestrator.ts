import { buildClaudeSessionId } from './claudeSessionSource.js';
import { runClaudeTurn } from './claudeRuntime.js';
import type { ClaudeCommandExecutor, ClaudeRuntimeSession, ClaudeTurnResult } from './types.js';
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

    const providerThreadId = typeof message?.meta?.claudeSessionId === 'string'
      ? message.meta.claudeSessionId.trim()
      : '';
    if (providerThreadId) {
      return providerThreadId;
    }

    const source = typeof message?.meta?.threadIdSource === 'string'
      ? message.meta.threadIdSource.trim()
      : '';
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
  prompt: string;
  chatId?: string;
  requestedThreadId?: string;
  storedThreadId?: string;
  model?: string;
  signal?: AbortSignal;
  onAction?: Parameters<ClaudeCommandExecutor>[0]['onAction'];
  executeCommand: ClaudeCommandExecutor;
}): Promise<ClaudeTurnResult & { actionThreadId?: string; messageMeta: Record<string, unknown> }> {
  const preferredThreadId = input.requestedThreadId ?? input.storedThreadId;
  const actionThreadId = buildClaudeActionThreadId(
    input.requestedThreadId,
    input.storedThreadId,
    input.session.id,
    input.chatId,
  );
  const result = await runClaudeTurn({
    session: input.session,
    prompt: input.prompt,
    chatId: input.chatId,
    preferredThreadId,
    model: input.model,
    signal: input.signal,
    onAction: input.onAction,
    executeCommand: input.executeCommand,
  });

  return {
    ...result,
    actionThreadId,
    messageMeta: result.threadId
      ? {
        claudeSessionId: result.threadId,
        threadIdSource: result.threadIdSource,
      }
      : {},
  };
}
