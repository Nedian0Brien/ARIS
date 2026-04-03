type ResolveNextChatReadMarkerInput = {
  activeChatId: string | null;
  eventsForChatId: string | null;
  latestEventId: string | null | undefined;
  hasScrollToBottomButton?: boolean;
};

export function resolveNextChatReadMarker(input: ResolveNextChatReadMarkerInput): string | null {
  if (!input.activeChatId || input.eventsForChatId !== input.activeChatId) {
    return null;
  }

  const latestEventId = typeof input.latestEventId === 'string' ? input.latestEventId.trim() : '';
  return latestEventId || null;
}
