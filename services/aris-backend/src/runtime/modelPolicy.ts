import { existsSync, readFileSync } from 'node:fs';
import * as path from 'node:path';
import type { AgentFlavor } from '../types.js';

type SupportedAgent = Exclude<AgentFlavor, 'unknown'>;
type ModelSelectionSource = 'requested' | 'session' | 'custom' | 'default';

const MODEL_ID_MAX_LEN = 120;
const DEFAULT_CUSTOM_MODEL_PATTERN_RAW = '^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$';
const DEFAULT_BUILTIN_MODELS_BY_AGENT: Record<SupportedAgent, readonly string[]> = {
  codex: ['gpt-5.3-codex', 'gpt-5.4', 'gpt-5', 'gpt-5-mini'],
  claude: ['claude-sonnet-4-6', 'claude-opus-4-6', 'claude-haiku-4-5'],
  gemini: ['gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.0-flash'],
};
const DEFAULT_LEGACY_ALIASES: Record<string, string> = {
  'gpt-5-codex': 'gpt-5.3-codex',
};

type ModelPolicyFileShape = {
  customModelPattern?: unknown;
  legacyAliases?: unknown;
  builtinModelsByAgent?: unknown;
};

type RuntimeModelPolicyConfig = {
  customModelPatternRaw: string;
  customModelPattern: RegExp;
  legacyAliases: Record<string, string>;
  builtinModelsByAgent: Record<SupportedAgent, readonly string[]>;
};

function parsePatternOrDefault(raw: unknown): { raw: string; regex: RegExp } {
  const pattern = typeof raw === 'string' && raw.trim().length > 0
    ? raw.trim()
    : DEFAULT_CUSTOM_MODEL_PATTERN_RAW;
  try {
    return { raw: pattern, regex: new RegExp(pattern) };
  } catch {
    return { raw: DEFAULT_CUSTOM_MODEL_PATTERN_RAW, regex: new RegExp(DEFAULT_CUSTOM_MODEL_PATTERN_RAW) };
  }
}

function resolvePolicyConfigPath(): string | null {
  const explicit = (process.env.ARIS_MODEL_POLICY_CONFIG_PATH || '').trim();
  const candidates = explicit
    ? [explicit]
    : [
      path.resolve(process.cwd(), 'config/model-policy.json'),
      path.resolve(process.cwd(), '../config/model-policy.json'),
      path.resolve(process.cwd(), '../../config/model-policy.json'),
      path.resolve(process.cwd(), '../../../config/model-policy.json'),
    ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function loadModelPolicyConfig(): RuntimeModelPolicyConfig {
  const parsedDefaultPattern = parsePatternOrDefault(DEFAULT_CUSTOM_MODEL_PATTERN_RAW);
  const fallback: RuntimeModelPolicyConfig = {
    customModelPatternRaw: parsedDefaultPattern.raw,
    customModelPattern: parsedDefaultPattern.regex,
    legacyAliases: DEFAULT_LEGACY_ALIASES,
    builtinModelsByAgent: DEFAULT_BUILTIN_MODELS_BY_AGENT,
  };

  const configPath = resolvePolicyConfigPath();
  if (!configPath) {
    return fallback;
  }

  try {
    const raw = JSON.parse(readFileSync(configPath, 'utf8')) as ModelPolicyFileShape;
    const parsedPattern = parsePatternOrDefault(raw.customModelPattern);
    const legacyAliases = (() => {
      if (!raw.legacyAliases || typeof raw.legacyAliases !== 'object' || Array.isArray(raw.legacyAliases)) {
        return DEFAULT_LEGACY_ALIASES;
      }
      const entries = Object.entries(raw.legacyAliases as Record<string, unknown>)
        .filter(([key, value]) => typeof key === 'string' && key.trim() && typeof value === 'string' && value.trim())
        .map(([key, value]) => [key.trim(), (value as string).trim()] as const);
      if (entries.length === 0) {
        return DEFAULT_LEGACY_ALIASES;
      }
      return Object.fromEntries(entries);
    })();
    const builtinModelsByAgent = (() => {
      if (!raw.builtinModelsByAgent || typeof raw.builtinModelsByAgent !== 'object' || Array.isArray(raw.builtinModelsByAgent)) {
        return DEFAULT_BUILTIN_MODELS_BY_AGENT;
      }
      const rec = raw.builtinModelsByAgent as Record<string, unknown>;
      const normalizeList = (agent: SupportedAgent): readonly string[] => {
        const list = rec[agent];
        if (!Array.isArray(list)) {
          return DEFAULT_BUILTIN_MODELS_BY_AGENT[agent];
        }
        const normalized = list
          .filter((value): value is string => typeof value === 'string')
          .map((value) => value.trim())
          .filter((value) => value.length > 0)
          .slice(0, 20);
        return normalized.length > 0 ? normalized : DEFAULT_BUILTIN_MODELS_BY_AGENT[agent];
      };
      return {
        codex: normalizeList('codex'),
        claude: normalizeList('claude'),
        gemini: normalizeList('gemini'),
      };
    })();
    return {
      customModelPatternRaw: parsedPattern.raw,
      customModelPattern: parsedPattern.regex,
      legacyAliases,
      builtinModelsByAgent,
    };
  } catch {
    return fallback;
  }
}

const MODEL_POLICY_CONFIG = loadModelPolicyConfig();
const CUSTOM_MODEL_PATTERN = MODEL_POLICY_CONFIG.customModelPattern;
const CUSTOM_MODEL_POLICY = 'pattern';

export const BUILTIN_MODELS_BY_AGENT: Record<SupportedAgent, readonly string[]> = MODEL_POLICY_CONFIG.builtinModelsByAgent;

function normalizeModelId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const canonical = MODEL_POLICY_CONFIG.legacyAliases[trimmed] ?? trimmed;
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
