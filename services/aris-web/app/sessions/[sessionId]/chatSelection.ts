import type { SessionChat } from '@/lib/happy/types';

type ChatSelectionInput = {
  chats: SessionChat[];
  selectedChatId: string | null;
  requestedChatId: string | null;
  isNewChatPlaceholder: boolean;
  isWorkspaceHome?: boolean;
};

export function shouldStartChatEntryLoading(input: {
  requestedChatId: string | null;
  resolvedChatId: string | null;
  isWorkspaceHome: boolean;
}): boolean {
  if (input.isWorkspaceHome) {
    return false;
  }
  return Boolean(input.requestedChatId && input.resolvedChatId);
}

export function resolveActiveChat(
  chats: SessionChat[],
  selectedChatId: string | null,
  isNewChatPlaceholder: boolean,
  isWorkspaceHome?: boolean,
): SessionChat | null {
  if (isNewChatPlaceholder || isWorkspaceHome) {
    return null;
  }
  return (selectedChatId ? chats.find((chat) => chat.id === selectedChatId) : null) ?? chats[0] ?? null;
}

export function resolveNextSelectedChatId({
  chats,
  selectedChatId,
  requestedChatId,
  isNewChatPlaceholder,
  isWorkspaceHome,
}: ChatSelectionInput): string | null {
  if (isNewChatPlaceholder || isWorkspaceHome) {
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

export function shouldShowChatTransitionLoading(input: {
  activeChatIdResolved: string | null;
  eventsForChatId: string | null;
  hasLoadedCurrentChat: boolean;
  isInitialChatEntryPendingReveal: boolean;
  isTailRestoreHydrated: boolean;
  isNewChatPlaceholder: boolean;
  isTailLayoutSettling: boolean;
}): boolean {
  if (input.isNewChatPlaceholder) {
    return false;
  }
  return input.isInitialChatEntryPendingReveal || input.isTailLayoutSettling;
}
