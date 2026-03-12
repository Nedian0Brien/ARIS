import { GeminiSession } from './geminiSession.js';

export function buildGeminiScopeKey(sessionId: string, chatId?: string): string {
  if (chatId && chatId.trim().length > 0) {
    return `${sessionId}:${chatId.trim()}`;
  }
  return `${sessionId}:__default__`;
}

export class GeminiSessionRegistry {
  private readonly sessions = new Map<string, GeminiSession>();

  get(scope: { sessionId: string; chatId?: string }): GeminiSession | undefined {
    return this.sessions.get(buildGeminiScopeKey(scope.sessionId, scope.chatId));
  }

  getOrCreate(scope: { sessionId: string; chatId?: string }): GeminiSession {
    const existing = this.get(scope);
    if (existing) {
      return existing;
    }

    const created = new GeminiSession(scope);
    this.sessions.set(buildGeminiScopeKey(scope.sessionId, scope.chatId), created);
    return created;
  }

  clear(scope: { sessionId: string; chatId?: string }): void {
    this.sessions.delete(buildGeminiScopeKey(scope.sessionId, scope.chatId));
  }
}
