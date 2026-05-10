import { buildClaudeCommand } from './claude/claudeLauncher.js';
import { buildCodexCommand } from './codex/codexLauncher.js';
import type { CodexLaunchCommand } from './codex/types.js';
import { buildGeminiCommand, type GeminiLaunchCommand } from './gemini/geminiLauncher.js';
import type {
  ProviderLaunchCommand,
  ProviderLaunchRequest,
} from '../contracts/providerRuntime.js';

export type ProviderCommand = ProviderLaunchCommand<'claude'> | CodexLaunchCommand | GeminiLaunchCommand;

export function buildProviderCommand(input: ProviderLaunchRequest): ProviderCommand | null {
  const resolvedResumeTarget = typeof input.resumeTarget === 'string'
    ? { id: input.resumeTarget, mode: 'resume' as const }
    : input.resumeTarget;

  if (input.agent === 'claude') {
    return buildClaudeCommand({
      prompt: input.prompt,
      approvalPolicy: input.approvalPolicy,
      model: input.model,
      resumeTarget: resolvedResumeTarget,
    });
  }

  if (input.agent === 'gemini') {
    return buildGeminiCommand({
      prompt: input.prompt,
      approvalPolicy: input.approvalPolicy,
      model: input.model,
      resumeTarget: resolvedResumeTarget,
    });
  }

  if (input.agent === 'codex') {
    const threadId = resolvedResumeTarget?.mode === 'session-id'
      ? undefined
      : resolvedResumeTarget?.id;
    return buildCodexCommand({
      prompt: input.prompt,
      approvalPolicy: input.approvalPolicy,
      model: input.model,
      channel: 'exec',
      ...(threadId ? { threadId } : {}),
    });
  }

  return null;
}
