export type ClientProvider = 'codex' | 'claude' | 'gemini';

export const BUILTIN_FALLBACK_BY_PROVIDER: Record<ClientProvider, string[]> = {
  codex: ['gpt-5.4', 'gpt-5.3-codex', 'gpt-5.3-codex-spark', 'gpt-5', 'gpt-5-mini'],
  claude: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
  gemini: ['auto-gemini-3', 'gemini-3-flash-preview', 'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
};

export function fallbackDefaultForProvider(provider: ClientProvider): string {
  return BUILTIN_FALLBACK_BY_PROVIDER[provider][0];
}

export function normalizeProjectChatModelInput(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === 'chat-stream') return undefined;
  const canonical = trimmed === 'gpt-5-codex' ? 'gpt-5.3-codex' : trimmed;
  return /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/.test(canonical) ? canonical : undefined;
}
