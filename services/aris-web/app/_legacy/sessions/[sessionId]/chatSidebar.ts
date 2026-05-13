type ResolveChatReadMarkerIdInput = {
  latestEventId?: string | null;
  fallbackLatestEventId?: string | null;
};

export function resolveChatReadMarkerId(input: ResolveChatReadMarkerIdInput): string | null {
  const primary = typeof input.latestEventId === 'string' ? input.latestEventId.trim() : '';
  if (primary) {
    return primary;
  }

  const fallback = typeof input.fallbackLatestEventId === 'string' ? input.fallbackLatestEventId.trim() : '';
  return fallback || null;
}
