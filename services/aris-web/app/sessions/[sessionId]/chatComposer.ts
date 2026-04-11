import type { AgentFlavor, ChatImageAttachment, UiEvent } from '@/lib/happy/types';

type BuildOptimisticUserEventInput = {
  chatId: string;
  agent: AgentFlavor;
  text: string;
  submittedAt: string;
  model?: string | null;
  geminiMode?: string | null;
  modelReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
  attachments?: ChatImageAttachment[];
};

export function buildOptimisticUserEvent(input: BuildOptimisticUserEventInput): UiEvent {
  return {
    id: `pending-user:${input.chatId}:${input.submittedAt}`,
    timestamp: input.submittedAt,
    kind: 'text_reply',
    title: 'User Instruction',
    body: input.text,
    meta: {
      role: 'user',
      chatId: input.chatId,
      agent: input.agent,
      ...(input.model ? { model: input.model } : {}),
      ...(input.geminiMode ? { geminiMode: input.geminiMode } : {}),
      ...(input.modelReasoningEffort ? { modelReasoningEffort: input.modelReasoningEffort } : {}),
      ...(input.attachments?.length ? { attachments: input.attachments } : {}),
    },
  };
}
