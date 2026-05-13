const DEBUG_TOGGLE_MIN_HEADER_WIDTH_PX = 1200;

export function shouldShowDebugToggleInHeader(headerWidth: number, isMobileLayout: boolean): boolean {
  return !isMobileLayout && Number.isFinite(headerWidth) && headerWidth >= DEBUG_TOGGLE_MIN_HEADER_WIDTH_PX;
}

export function looksLikeShellTranscript(body: string): boolean {
  const normalized = body.replace(/\r\n/g, '\n').trim();
  if (!normalized) {
    return false;
  }

  const lines = normalized.split('\n');
  let commandLines = 0;
  let transcriptSignals = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      continue;
    }

    if (/^(\$|>|#)\s+\S+/.test(trimmed)) {
      commandLines += 1;
      transcriptSignals += 1;
      continue;
    }

    if (/^(exit code|stdout|stderr|command completed|result|return value):/i.test(trimmed)) {
      transcriptSignals += 1;
      continue;
    }
  }

  return commandLines > 0 || transcriptSignals >= 2;
}
