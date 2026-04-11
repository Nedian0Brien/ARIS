import { buildImageAttachmentPromptPrefix } from '@/lib/chatImageAttachments';
import type { AgentFlavor, ChatImageAttachment } from '@/lib/happy/types';

type ModelReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';

export type ComposerContextBlock =
  | { type: 'file'; path: string; content: string }
  | { type: 'text'; text: string };

export function buildComposerSubmitText(input: {
  promptText: string;
  imageAttachments?: ChatImageAttachment[];
  contextBlocks?: ComposerContextBlock[];
}): string {
  const imagePrefix = buildImageAttachmentPromptPrefix(input.imageAttachments ?? []);
  const contextPrefix = (input.contextBlocks ?? []).length > 0
    ? (input.contextBlocks ?? []).map((item) => (
      item.type === 'file'
        ? `<file path="${item.path}">\n${item.content}\n</file>`
        : `<context>\n${item.text}\n</context>`
    )).join('\n') + '\n\n'
    : '';
  return imagePrefix + contextPrefix + input.promptText;
}

export function buildUserMessageMeta(input: {
  chatId: string;
  agent: AgentFlavor;
  model: string;
  geminiMode?: string;
  modelReasoningEffort?: ModelReasoningEffort;
  threadId?: string;
  attachments?: ChatImageAttachment[];
}) {
  return {
    role: 'user' as const,
    chatId: input.chatId,
    agent: input.agent,
    model: input.model,
    ...(input.geminiMode ? { geminiMode: input.geminiMode } : {}),
    ...(input.modelReasoningEffort
      ? {
          modelReasoningEffort: input.modelReasoningEffort,
          model_reasoning_effort: input.modelReasoningEffort,
        }
      : {}),
    ...(input.threadId ? { threadId: input.threadId } : {}),
    ...(input.attachments?.length ? { attachments: input.attachments } : {}),
  };
}
