import type { AgentFlavor, UiEvent } from '@/lib/happy/types';

export type ComposerImageAttachment = {
  assetId: string;
  kind: 'image';
  name: string;
  mimeType: string;
  size: number;
  serverPath: string;
  previewUrl: string;
  width?: number;
  height?: number;
};

type BuildOptimisticUserEventInput = {
  chatId: string;
  agent: AgentFlavor;
  text: string;
  submittedAt: string;
  model?: string | null;
  geminiMode?: string | null;
  modelReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
  attachments?: ComposerImageAttachment[];
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
      ...(input.attachments && input.attachments.length > 0 ? { attachments: input.attachments } : {}),
    },
  };
}
