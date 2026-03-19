import type { SessionChat } from '@/lib/happy/types';

type ChatSelectionInput = {
  chats: SessionChat[];
  selectedChatId: string | null;
  requestedChatId: string | null;
  isNewChatPlaceholder: boolean;
};

export function resolveActiveChat(
  chats: SessionChat[],
  selectedChatId: string | null,
  isNewChatPlaceholder: boolean,
): SessionChat | null {
  if (isNewChatPlaceholder) {
    return null;
  }
  return (selectedChatId ? chats.find((chat) => chat.id === selectedChatId) : null) ?? chats[0] ?? null;
}

export function resolveNextSelectedChatId({
  chats,
  selectedChatId,
  requestedChatId,
  isNewChatPlaceholder,
}: ChatSelectionInput): string | null {
  if (isNewChatPlaceholder) {
    return null;
  }
  if (selectedChatId && chats.some((chat) => chat.id === selectedChatId)) {
    return selectedChatId;
  }
  if (requestedChatId && chats.some((chat) => chat.id === requestedChatId)) {
    return requestedChatId;
  }
  return chats[0]?.id ?? null;
}
