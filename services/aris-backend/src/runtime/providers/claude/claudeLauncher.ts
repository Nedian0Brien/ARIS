import { setTimeout as delay } from 'node:timers/promises';
import type {
  ClaudeActionEvent,
  ClaudeCliResult,
  ClaudeCommandExecutor,
  ClaudeLaunchCommand,
  ClaudePermissionRequest,
  ClaudeResumeTarget,
} from './types.js';
import type { ApprovalPolicy, PermissionDecision } from '../../../types.js';

function normalizeClaudePermissionMode(value: ApprovalPolicy): 'default' | 'dontAsk' | 'bypassPermissions' {
  if (value === 'never') {
    return 'dontAsk';
  }
  if (value === 'yolo') {
    return 'bypassPermissions';
  }
  return 'default';
}

function normalizeResumeId(resumeTarget?: ClaudeResumeTarget): string | undefined {
  return typeof resumeTarget?.id === 'string' && resumeTarget.id.trim().length > 0
    ? resumeTarget.id.trim().slice(0, 120)
    : undefined;
}

export function buildClaudeCommand(input: {
  prompt: string;
  approvalPolicy: ApprovalPolicy;
  model?: string;
  resumeTarget?: ClaudeResumeTarget;
}): ClaudeLaunchCommand {
  const permissionMode = normalizeClaudePermissionMode(input.approvalPolicy);
  const normalizedResumeId = normalizeResumeId(input.resumeTarget);
  const claudeResumeArgs = normalizedResumeId
    ? [input.resumeTarget?.mode === 'session-id' ? '--session-id' : '--resume', normalizedResumeId]
    : [];
  const args = [
    '--print',
    '--output-format',
    'stream-json',
    '--verbose',
    '--permission-mode',
    permissionMode,
    ...(input.model ? ['--model', input.model] : []),
    ...claudeResumeArgs,
    input.prompt,
  ];

  return {
    command: 'claude',
    args,
    requiresPty: false,
    streamJson: true,
    ...(normalizedResumeId ? { retryArgsOnFailure: [...args] } : {}),
  };
}

export function isClaudeSessionInUseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('session id') && message.includes('already in use');
}

export function isClaudeMissingConversationError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  return message.includes('no conversation found with session id');
}

export async function runClaudeCommand(input: {
  prompt: string;
  approvalPolicy: ApprovalPolicy;
  model?: string;
  cwdHint?: string;
  signal?: AbortSignal;
  resumeTarget?: ClaudeResumeTarget;
  onAction?: (action: ClaudeActionEvent) => Promise<void>;
  onPermission?: (request: ClaudePermissionRequest) => Promise<PermissionDecision>;
  executeCommand: ClaudeCommandExecutor;
}): Promise<ClaudeCliResult> {
  const command = buildClaudeCommand({
    prompt: input.prompt,
    approvalPolicy: input.approvalPolicy,
    model: input.model,
    resumeTarget: input.resumeTarget,
  });

  const runOnce = async () => input.executeCommand({
    command,
    cwdHint: input.cwdHint,
    signal: input.signal,
    onAction: input.onAction,
    onPermission: input.onPermission,
  });

  try {
    return await runOnce();
  } catch (error) {
    if (!isClaudeSessionInUseError(error) || input.signal?.aborted) {
      throw error;
    }
    if (input.resumeTarget?.mode === 'session-id') {
      throw error;
    }
    await delay(1500);
    return runOnce();
  }
}
