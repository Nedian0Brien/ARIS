import type { RuntimeMessage } from '../../../types.js';
import type { GeminiResumeTarget, GeminiThreadIdSource } from './types.js';

function normalizeThreadId(threadId: string | undefined): string | undefined {
  if (typeof threadId !== 'string') {
    return undefined;
  }
  const trimmed = threadId.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function buildGeminiResumeTarget(
  preferredThreadId?: string,
): { resumeTarget?: GeminiResumeTarget; threadIdSource?: GeminiThreadIdSource } {
  const resumeThreadId = normalizeThreadId(preferredThreadId);
  if (!resumeThreadId) {
    return {};
  }

  return {
    resumeTarget: { id: resumeThreadId, mode: 'resume' },
    threadIdSource: 'resume',
  };
}

export function chooseGeminiPreferredThreadId(input: {
  requestedThreadId?: string;
  activeThreadId?: string;
  storedThreadId?: string;
}): string | undefined {
  const requested = normalizeThreadId(input.requestedThreadId);
  if (requested) {
    return requested;
  }

  const active = normalizeThreadId(input.activeThreadId);
  if (active) {
    return active;
  }

  return normalizeThreadId(input.storedThreadId);
}

export function resolveGeminiThreadId(input: {
  observedThreadId?: string;
  resumeThreadId?: string;
}): { threadId?: string; threadIdSource?: GeminiThreadIdSource } {
  const observedThreadId = normalizeThreadId(input.observedThreadId);
  if (observedThreadId) {
    return {
      threadId: observedThreadId,
      threadIdSource: 'observed',
    };
  }

  const resumeThreadId = normalizeThreadId(input.resumeThreadId);
  if (resumeThreadId) {
    return {
      threadId: resumeThreadId,
      threadIdSource: 'resume',
    };
  }

  return {};
}

export function recoverGeminiThreadIdFromMessages(messages: RuntimeMessage[], chatId?: string): string | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    const meta = message?.meta;
    if (!meta || typeof meta !== 'object') {
      continue;
    }

    const agent = typeof meta.agent === 'string' ? meta.agent.trim() : '';
    if (agent && agent !== 'gemini') {
      continue;
    }

    if (chatId) {
      const messageChatId = typeof meta.chatId === 'string' ? meta.chatId.trim() : '';
      if (messageChatId !== chatId) {
        continue;
      }
    }

    const candidates = [
      meta.geminiSessionId,
      meta.threadId,
      meta.sessionId,
    ];
    for (const candidate of candidates) {
      if (typeof candidate !== 'string') {
        continue;
      }
      const normalized = normalizeThreadId(candidate);
      if (normalized) {
        return normalized;
      }
    }
  }

  return undefined;
}
