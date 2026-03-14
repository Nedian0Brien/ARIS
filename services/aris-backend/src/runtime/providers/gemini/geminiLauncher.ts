import type { ApprovalPolicy } from '../../../types.js';
import type { ProviderLaunchCommand, ProviderResumeTarget } from '../../contracts/providerRuntime.js';

export type GeminiLaunchCommand = ProviderLaunchCommand<'gemini'> & {
  requiresPty?: false;
  streamJson: true;
  fallbackArgs: string[];
};

export function buildGeminiCommand(input: {
  prompt: string;
  approvalPolicy: ApprovalPolicy;
  model?: string;
  resumeTarget?: ProviderResumeTarget;
}): GeminiLaunchCommand {
  const normalizedResumeId = input.resumeTarget?.mode === 'resume'
    && typeof input.resumeTarget.id === 'string'
    && input.resumeTarget.id.trim().length > 0
    ? input.resumeTarget.id.trim().slice(0, 120)
    : undefined;
  const approvalArgs = input.approvalPolicy === 'yolo' ? ['--approval-mode', 'yolo'] : [];
  const args = [
    ...(input.model ? ['-m', input.model] : []),
    ...approvalArgs,
    '--output-format',
    'stream-json',
    ...(normalizedResumeId ? ['--resume', normalizedResumeId] : []),
    '-p',
    input.prompt,
  ];
  const fallbackArgs = [
    ...(input.model ? ['-m', input.model] : []),
    ...approvalArgs,
    ...(normalizedResumeId ? ['--resume', normalizedResumeId] : []),
    '-p',
    input.prompt,
  ];

  return {
    command: 'gemini',
    args,
    fallbackArgs,
    ...(normalizedResumeId
      ? {
        retryArgsOnFailure: [
          ...(input.model ? ['-m', input.model] : []),
          ...approvalArgs,
          '--output-format',
          'stream-json',
          '-p',
          input.prompt,
        ],
      }
      : {}),
    streamJson: true,
  };
}
