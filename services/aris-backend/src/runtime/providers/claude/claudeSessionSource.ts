import { createHash } from 'node:crypto';
import type { ClaudeResumeTarget, ClaudeThreadIdSource } from './types.js';

function formatUuidFromBytes(bytes: Uint8Array): string {
  const hex = Buffer.from(bytes).toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

function buildDeterministicUuid(seed: string): string {
  const hash = createHash('sha1').update(seed).digest();
  const bytes = Uint8Array.from(hash.subarray(0, 16));
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return formatUuidFromBytes(bytes);
}

export function buildClaudeSessionId(sessionId: string, chatId?: string, variant?: string | number): string {
  const scopedChatId = typeof chatId === 'string' && chatId.trim().length > 0
    ? chatId.trim()
    : '__default__';
  const scopedVariant = variant === undefined ? '' : `:${String(variant).trim() || '0'}`;
  return buildDeterministicUuid(`aris:claude:${sessionId}:${scopedChatId}${scopedVariant}`);
}

export function buildClaudeResumeTarget(
  preferredThreadId: string | undefined,
  sessionId: string,
  chatId?: string,
  syntheticThreadId?: string,
): { resumeTarget?: ClaudeResumeTarget; actionThreadId?: string; threadIdSource: ClaudeThreadIdSource } {
  if (preferredThreadId) {
    return {
      resumeTarget: { id: preferredThreadId, mode: 'resume' },
      actionThreadId: preferredThreadId,
      threadIdSource: 'resume',
    };
  }

  const generatedSessionId = typeof syntheticThreadId === 'string' && syntheticThreadId.trim().length > 0
    ? syntheticThreadId.trim()
    : buildClaudeSessionId(sessionId, chatId);
  return {
    actionThreadId: generatedSessionId,
    threadIdSource: 'synthetic',
  };
}

export function chooseClaudePreferredThreadId(input: {
  requestedThreadId?: string;
  activeThreadId?: string;
  storedThreadId?: string;
}): string | undefined {
  const requested = typeof input.requestedThreadId === 'string' && input.requestedThreadId.trim().length > 0
    ? input.requestedThreadId.trim()
    : undefined;
  if (requested) {
    return requested;
  }

  const active = typeof input.activeThreadId === 'string' && input.activeThreadId.trim().length > 0
    ? input.activeThreadId.trim()
    : undefined;
  if (active) {
    return active;
  }

  const stored = typeof input.storedThreadId === 'string' && input.storedThreadId.trim().length > 0
    ? input.storedThreadId.trim()
    : undefined;
  return stored;
}

export function resolveClaudeThreadId(input: {
  observedThreadId?: string;
  actionThreadId?: string;
  initialSource: ClaudeThreadIdSource;
}): { threadId?: string; threadIdSource: ClaudeThreadIdSource } {
  const observedThreadId = typeof input.observedThreadId === 'string' && input.observedThreadId.trim().length > 0
    ? input.observedThreadId.trim()
    : undefined;
  if (observedThreadId) {
    return {
      threadId: observedThreadId,
      threadIdSource: 'observed',
    };
  }

  return {
    threadId: input.actionThreadId,
    threadIdSource: input.initialSource,
  };
}
