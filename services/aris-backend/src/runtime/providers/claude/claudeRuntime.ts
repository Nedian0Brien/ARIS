import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { ClaudeResumeTarget, ClaudeRunCli, ClaudeRuntimeSession, ClaudeTurnResult } from './types.js';

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

export function buildClaudeSessionId(sessionId: string, chatId?: string): string {
  const scopedChatId = typeof chatId === 'string' && chatId.trim().length > 0
    ? chatId.trim()
    : '__default__';
  return buildDeterministicUuid(`aris:claude:${sessionId}:${scopedChatId}`);
}

export function isClaudeSessionInUseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('session id') && message.includes('already in use');
}

export function buildClaudeResumeTarget(
  preferredThreadId: string | undefined,
  sessionId: string,
  chatId?: string,
): { resumeTarget?: ClaudeResumeTarget; actionThreadId?: string } {
  if (preferredThreadId) {
    return {
      resumeTarget: { id: preferredThreadId, mode: 'resume' },
      actionThreadId: preferredThreadId,
    };
  }

  const generatedSessionId = buildClaudeSessionId(sessionId, chatId);
  return {
    resumeTarget: { id: generatedSessionId, mode: 'session-id' },
    actionThreadId: generatedSessionId,
  };
}

export async function runClaudeTurn(input: {
  session: ClaudeRuntimeSession;
  prompt: string;
  chatId?: string;
  preferredThreadId?: string;
  model?: string;
  signal?: AbortSignal;
  runCli: ClaudeRunCli;
}): Promise<ClaudeTurnResult> {
  const { resumeTarget, actionThreadId } = buildClaudeResumeTarget(
    input.preferredThreadId,
    input.session.id,
    input.chatId,
  );

  const runOnce = async () => input.runCli({
    prompt: input.prompt,
    approvalPolicy: input.session.metadata.approvalPolicy,
    model: input.model,
    cwdHint: input.session.metadata.path,
    signal: input.signal,
    resumeTarget,
  });

  try {
    const result = await runOnce();
    return {
      output: result.output,
      cwd: result.cwd,
      streamedActionsPersisted: result.streamedActionsPersisted,
      inferredActions: result.inferredActions,
      threadId: result.threadId ?? actionThreadId,
    };
  } catch (error) {
    if (!isClaudeSessionInUseError(error) || input.signal?.aborted) {
      throw error;
    }
    await delay(1500);
    const retry = await runOnce();
    return {
      output: retry.output,
      cwd: retry.cwd,
      streamedActionsPersisted: retry.streamedActionsPersisted,
      inferredActions: retry.inferredActions,
      threadId: retry.threadId ?? actionThreadId,
    };
  }
}
