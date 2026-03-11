import { createHash } from 'node:crypto';
import { runClaudeCommand } from './claudeLauncher.js';
import type { ClaudeCommandExecutor, ClaudeResumeTarget, ClaudeRuntimeSession, ClaudeTurnResult } from './types.js';

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
  onAction?: Parameters<ClaudeCommandExecutor>[0]['onAction'];
  executeCommand: ClaudeCommandExecutor;
}): Promise<ClaudeTurnResult> {
  const { resumeTarget, actionThreadId } = buildClaudeResumeTarget(
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

  return {
    output: result.output,
    cwd: result.cwd,
    streamedActionsPersisted: result.streamedActionsPersisted,
    inferredActions: result.inferredActions,
    threadId: result.threadId ?? actionThreadId,
  };
}
