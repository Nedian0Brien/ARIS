import { buildClaudeCommand } from './claude/claudeLauncher.js';
import type { ClaudeLaunchCommand, ClaudeResumeTarget } from './claude/types.js';
import { buildGeminiCommand, type GeminiLaunchCommand } from './gemini/geminiLauncher.js';
import type { ApprovalPolicy, RuntimeSession } from '../../types.js';

export type ProviderCommand = ClaudeLaunchCommand | GeminiLaunchCommand;
type RuntimeAgent = RuntimeSession['metadata']['flavor'];

export function buildProviderCommand(input: {
  agent: RuntimeAgent;
  prompt: string;
  approvalPolicy: ApprovalPolicy;
  model?: string;
  resumeTarget?: ClaudeResumeTarget | string;
}): ProviderCommand | null {
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
