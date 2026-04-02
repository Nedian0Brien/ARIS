import type { ProviderRuntime } from '../../contracts/providerRuntime.js';
import { ScopeQueue } from '../../scopeQueue.js';
import { GeminiSessionRegistry, buildGeminiScopeKey } from './geminiSessionRegistry.js';
import { recoverGeminiThreadIdFromMessages } from './geminiSessionSource.js';
import type { GeminiMessageHistoryLoader, GeminiRuntimeSession, GeminiTurnExecutor, GeminiTurnResult } from './types.js';

function extractObservedThreadIdFromError(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }
  const candidate = (error as { threadId?: unknown }).threadId;
  return typeof candidate === 'string' && candidate.trim().length > 0
    ? candidate.trim()
    : undefined;
}

export function createGeminiRuntime(input: {
  registry?: GeminiSessionRegistry;
  listMessages?: GeminiMessageHistoryLoader;
  executeTurn?: GeminiTurnExecutor;
} = {}): ProviderRuntime<GeminiRuntimeSession, GeminiTurnResult> {
  const registry = input.registry ?? new GeminiSessionRegistry();
  const scopeQueue = new ScopeQueue();

  return {
    provider: 'gemini',
    async sendTurn(request) {
      if (!input.executeTurn) {
        throw new Error('Gemini turn executor is not configured');
      }

      const scope = {
        sessionId: request.session.id,
        chatId: request.chatId,
      };
      const runKey = buildGeminiScopeKey(scope.sessionId, scope.chatId);
      const sessionOwner = registry.getOrCreate(scope);
      const preferredThreadId = sessionOwner.resolvePreferredThreadId(request.requestedThreadId, request.storedThreadId);

      return scopeQueue.run(runKey, async () => {
        const result = await input.executeTurn!({
          ...request,
          preferredThreadId,
        }).catch((error) => {
          const observedThreadId = extractObservedThreadIdFromError(error);
          if (observedThreadId) {
            sessionOwner.observeThreadId(observedThreadId);
          }
          throw error;
        });

        if (result.threadId && result.threadIdSource === 'observed') {
          sessionOwner.observeThreadId(result.threadId);
        } else if (result.threadId && result.threadIdSource === 'resume') {
          sessionOwner.restoreThreadId(result.threadId, 'resume');
        }

        return result;
      });
    },
    abortTurn(_scope) {
      // ScopeQueue는 abort를 지원하지 않음 — abort 신호는 executeTurn 내부의 AbortSignal로 처리됨
    },
    async recoverSession(request) {
      const storedThreadId = typeof request.storedThreadId === 'string' && request.storedThreadId.trim().length > 0
        ? request.storedThreadId.trim()
        : undefined;
      if (storedThreadId) {
        return {
          session: request.session,
          chatId: request.chatId,
          recoveredThreadId: storedThreadId,
          threadIdSource: 'resume' as const,
          source: 'stored' as const,
        };
      }

      if (input.listMessages) {
        const recoveredThreadId = recoverGeminiThreadIdFromMessages(
          await input.listMessages(request.session.id),
          request.chatId,
        );
        if (recoveredThreadId) {
          return {
            session: request.session,
            chatId: request.chatId,
            recoveredThreadId,
            threadIdSource: 'observed' as const,
            source: 'messages' as const,
          };
        }
      }

      return {
        session: request.session,
        chatId: request.chatId,
        source: 'none' as const,
      };
    },
    isRunning(scope) {
      return scopeQueue.isQueued(buildGeminiScopeKey(scope.sessionId, scope.chatId));
    },
  };
}
