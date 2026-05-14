import type { SessionChat } from '@/lib/happy/types';

export const ASK_ARIS_AGENT = 'codex' as const;
export const ASK_ARIS_REASONING_EFFORT: NonNullable<SessionChat['modelReasoningEffort']> = 'high';

export function normalizeAskArisPrompt(input: string): string {
  return input.trim();
}

export function buildAskArisSessionPayload(rootPath: string) {
  return {
    path: rootPath,
    agent: ASK_ARIS_AGENT,
    approvalPolicy: 'on-request' as const,
  };
}

export function buildAskArisChatTitle(prompt: string): string {
  const normalized = normalizeAskArisPrompt(prompt).replace(/\s+/g, ' ');
  if (!normalized) {
    return 'Ask ARIS';
  }
  if (normalized.length <= 64) {
    return normalized;
  }
  return `${normalized.slice(0, 61)}...`;
}

export function buildAskArisEventPayload(input: {
  chatId: string;
  prompt: string;
  model?: string | null;
  modelReasoningEffort?: SessionChat['modelReasoningEffort'];
}) {
  const meta: {
    role: 'user';
    chatId: string;
    agent: typeof ASK_ARIS_AGENT;
    model?: string;
    modelReasoningEffort?: SessionChat['modelReasoningEffort'];
  } = {
    role: 'user',
    chatId: input.chatId,
    agent: ASK_ARIS_AGENT,
  };

  if (input.model?.trim()) {
    meta.model = input.model.trim();
  }
  if (input.modelReasoningEffort) {
    meta.modelReasoningEffort = input.modelReasoningEffort;
  }

  return {
    type: 'message' as const,
    title: 'User Instruction',
    text: normalizeAskArisPrompt(input.prompt),
    meta,
  };
}
