import type { AgentFlavor } from './types';

type SupportedAgent = Exclude<AgentFlavor, 'unknown'>;
type ModelSelectionSource = 'requested' | 'session' | 'custom' | 'default';

const MODEL_ID_MAX_LEN = 120;
const CUSTOM_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'gpt-5-codex': 'gpt-5.3-codex',
};

export const BUILTIN_MODELS_BY_AGENT: Record<SupportedAgent, readonly string[]> = {
  codex: ['gpt-5.3-codex', 'gpt-5', 'gpt-5-mini'],
  claude: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
};

export function normalizeSupportedAgent(value: unknown, fallback: SupportedAgent = 'codex'): SupportedAgent {
  if (value === 'codex' || value === 'claude' || value === 'gemini') {
    return value;
  }
  return fallback;
}

export function normalizeModelId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  const canonical = LEGACY_MODEL_ALIASES[trimmed] ?? trimmed;
  return canonical.slice(0, MODEL_ID_MAX_LEN);
}

export function sanitizeCustomModel(value: unknown): string | null {
  const normalized = normalizeModelId(value);
  if (!normalized) {
    return null;
  }
  return CUSTOM_MODEL_PATTERN.test(normalized) ? normalized : null;
}

export type ResolvedModelSelection = {
  agent: SupportedAgent;
  model: string;
  source: ModelSelectionSource;
  requestedModel?: string;
  customModel?: string;
  fallbackReason?: 'requested_disallowed' | 'requested_missing';
};

export function resolveRuntimeMessageModel(input: {
  agent: AgentFlavor;
  requestedModel?: unknown;
  sessionModel?: unknown;
  customModel?: unknown;
}): ResolvedModelSelection {
  const agent = normalizeSupportedAgent(input.agent);
  const builtinModels = BUILTIN_MODELS_BY_AGENT[agent];
  const defaultModel = builtinModels[0];
  const requestedModel = normalizeModelId(input.requestedModel) ?? undefined;
  const sessionModel = normalizeModelId(input.sessionModel) ?? undefined;
  const customModel = sanitizeCustomModel(input.customModel) ?? undefined;

  const isAllowedModel = (model: string | undefined): model is string => {
    if (!model) {
      return false;
    }
    return builtinModels.includes(model) || (customModel ? model === customModel : false);
  };

  if (requestedModel && isAllowedModel(requestedModel)) {
    return {
      agent,
      model: requestedModel,
      source: 'requested',
      requestedModel,
      ...(customModel ? { customModel } : {}),
    };
  }

  if (sessionModel && isAllowedModel(sessionModel)) {
    return {
      agent,
      model: sessionModel,
      source: 'session',
      ...(requestedModel ? { requestedModel, fallbackReason: 'requested_disallowed' } : {}),
      ...(customModel ? { customModel } : {}),
    };
  }

  if (customModel && isAllowedModel(customModel)) {
    return {
      agent,
      model: customModel,
      source: 'custom',
      ...(requestedModel ? { requestedModel, fallbackReason: 'requested_disallowed' } : {}),
      ...(customModel ? { customModel } : {}),
    };
  }

  return {
    agent,
    model: defaultModel,
    source: 'default',
    ...(requestedModel ? { requestedModel, fallbackReason: 'requested_disallowed' } : { fallbackReason: 'requested_missing' }),
    ...(customModel ? { customModel } : {}),
  };
}
