import { buildClaudeCommand } from './claude/claudeLauncher.js';
import { buildGeminiCommand, type GeminiLaunchCommand } from './gemini/geminiLauncher.js';
import type {
  ProviderLaunchCommand,
  ProviderLaunchRequest,
} from '../contracts/providerRuntime.js';

export type ProviderCommand = ProviderLaunchCommand<'claude'> | GeminiLaunchCommand;

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
      model: input.model,
      resumeTarget: resolvedResumeTarget,
    });
  }

  return null;
}
