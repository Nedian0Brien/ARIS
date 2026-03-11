import type { ClaudeResumeTarget } from '../claude/types.js';

export type GeminiLaunchCommand = {
  command: 'gemini';
  args: string[];
  requiresPty?: false;
  streamJson: true;
  fallbackArgs: string[];
  retryArgsOnFailure?: string[];
};

export function buildGeminiCommand(input: {
  prompt: string;
  model?: string;
  resumeTarget?: ClaudeResumeTarget;
}): GeminiLaunchCommand {
  const normalizedResumeId = typeof input.resumeTarget?.id === 'string' && input.resumeTarget.id.trim().length > 0
    ? input.resumeTarget.id.trim().slice(0, 120)
    : undefined;
  const args = [
    ...(input.model ? ['-m', input.model] : []),
    '--output-format',
    'stream-json',
    ...(normalizedResumeId ? ['--resume', normalizedResumeId] : []),
    '-p',
    input.prompt,
  ];
  const fallbackArgs = [
    ...(input.model ? ['-m', input.model] : []),
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
