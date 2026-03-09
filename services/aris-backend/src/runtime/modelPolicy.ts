import type { AgentFlavor } from '../types.js';

type SupportedAgent = Exclude<AgentFlavor, 'unknown'>;
type ModelSelectionSource = 'requested' | 'session' | 'custom' | 'default';

const MODEL_ID_MAX_LEN = 120;
const DEFAULT_CUSTOM_MODEL_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/;
const CUSTOM_MODEL_POLICY = (process.env.HAPPY_CUSTOM_MODEL_POLICY || 'strict').trim().toLowerCase();
const CUSTOM_MODEL_PATTERN = (() => {
  const raw = (process.env.HAPPY_CUSTOM_MODEL_PATTERN || '').trim();
  if (!raw) {
    return DEFAULT_CUSTOM_MODEL_PATTERN;
  }
  try {
    return new RegExp(raw);
  } catch {
    return DEFAULT_CUSTOM_MODEL_PATTERN;
  }
})();

const LEGACY_MODEL_ALIASES: Record<string, string> = {
  'gpt-5-codex': 'gpt-5.3-codex',
};

export const BUILTIN_MODELS_BY_AGENT: Record<SupportedAgent, readonly string[]> = {
  codex: ['gpt-5.3-codex', 'gpt-5', 'gpt-5-mini'],
  claude: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
};

function normalizeModelId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const canonical = LEGACY_MODEL_ALIASES[trimmed] ?? trimmed;
  return canonical.slice(0, MODEL_ID_MAX_LEN);
}

function isPatternAllowedModel(model: string): boolean {
  if (CUSTOM_MODEL_POLICY !== 'pattern') {
    return false;
  }
  return CUSTOM_MODEL_PATTERN.test(model);
}

export function normalizeSupportedAgent(value: unknown, fallback: SupportedAgent = 'codex'): SupportedAgent {
  if (value === 'codex' || value === 'claude' || value === 'gemini') {
    return value;
  }
  return fallback;
}

export type ResolvedModelSelection = {
  agent: SupportedAgent;
  model: string;
  source: ModelSelectionSource;
  requestedModel?: string;
  customModel?: string;
  fallbackReason?: 'requested_disallowed' | 'requested_missing';
};

export function resolveRuntimeModelSelection(input: {
  agent: AgentFlavor;
  requestedModel?: unknown;
  sessionModel?: unknown;
  customModel?: unknown;
}): ResolvedModelSelection {
  const agent = normalizeSupportedAgent(input.agent);
  const builtinModels = BUILTIN_MODELS_BY_AGENT[agent];
  const defaultModel = builtinModels[0];

  const requestedModel = normalizeModelId(input.requestedModel);
  const sessionModel = normalizeModelId(input.sessionModel);
  const customModelCandidate = normalizeModelId(input.customModel);
  const customModel = customModelCandidate && CUSTOM_MODEL_PATTERN.test(customModelCandidate)
    ? customModelCandidate
    : undefined;

  const isAllowedModel = (model: string | undefined): model is string => {
    if (!model) {
      return false;
    }
    if (builtinModels.includes(model)) {
      return true;
    }
    if (customModel && model === customModel) {
      return true;
    }
    return isPatternAllowedModel(model);
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
      ...(requestedModel ? { requestedModel } : {}),
      ...(customModel ? { customModel } : {}),
      ...(requestedModel ? { fallbackReason: 'requested_disallowed' } : {}),
    };
  }

  if (customModel && isAllowedModel(customModel)) {
    return {
      agent,
      model: customModel,
      source: 'custom',
      ...(requestedModel ? { requestedModel } : {}),
      ...(customModel ? { customModel } : {}),
      ...(requestedModel ? { fallbackReason: 'requested_disallowed' } : {}),
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
