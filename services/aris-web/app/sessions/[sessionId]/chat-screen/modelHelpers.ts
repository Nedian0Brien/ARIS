import { Cpu } from 'lucide-react';
import type { AgentFlavor, ApprovalPolicy } from '@/lib/happy/types';
import {
  DEFAULT_GEMINI_MODE_ID,
  GEMINI_MODE_SELECTION_OPTIONS,
  deriveOpenAiModelLabel,
  type ProviderModelSelections,
} from '@/lib/settings/providerModels';
import {
  ClaudeIcon,
  CodexIcon,
  GeminiIcon,
} from '@/components/ui/AgentIcons';
import { COMPOSER_MODELS_BY_AGENT } from './constants';
import type {
  AgentMeta,
  ComposerModelOption,
  GeminiModeOption,
  LegacyCustomModels,
  ModelReasoningEffort,
} from './types';

export function resolveAgentMeta(agentFlavor: string): AgentMeta {
  if (agentFlavor === 'claude') {
    return { label: 'Claude', tone: 'clay', Icon: ClaudeIcon };
  }
  if (agentFlavor === 'codex') {
    return { label: 'Codex', tone: 'mint', Icon: CodexIcon };
  }
  if (agentFlavor === 'gemini') {
    return { label: 'Gemini', tone: 'blue', Icon: GeminiIcon };
  }
  return { label: 'Runtime', tone: 'blue', Icon: Cpu };
}

export function resolveAgentSubtitle(agentFlavor: string): string {
  if (agentFlavor === 'claude') return '균형 잡힌 코딩 흐름';
  if (agentFlavor === 'codex') return '빠른 구현 및 실행';
  if (agentFlavor === 'gemini') return '넓은 맥락과 추론';
  return '에이전틱 런타임';
}

export function normalizeAgentFlavor(value: unknown, fallback: AgentFlavor = 'codex'): AgentFlavor {
  if (value === 'claude' || value === 'codex' || value === 'gemini') {
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
  const canonical = trimmed === 'gpt-5-codex' ? 'gpt-5.3-codex' : trimmed;
  return canonical.slice(0, 120);
}

export function normalizeGeminiModeId(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 120);
}

export function normalizeModelReasoningEffort(
  value: unknown,
  fallback: ModelReasoningEffort = 'medium',
): ModelReasoningEffort {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
    return value;
  }
  return fallback;
}

function isSupportedAgentFlavor(value: AgentFlavor): value is 'codex' | 'claude' | 'gemini' {
  return value === 'codex' || value === 'claude' || value === 'gemini';
}

export function deriveGeminiModeLabel(modeId: string): string {
  const normalized = modeId.trim().toLowerCase();
  if (normalized === 'default') {
    return 'Default';
  }
  if (normalized === 'yolo') {
    return 'YOLO';
  }
  if (normalized === 'plan') {
    return 'Plan';
  }
  if (normalized === 'autoedit' || normalized === 'auto_edit') {
    return 'Auto Edit';
  }
  return modeId
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function resolveGeminiModeOptions(approvalPolicy?: ApprovalPolicy): GeminiModeOption[] {
  const options = GEMINI_MODE_SELECTION_OPTIONS as ReadonlyArray<{ id: string; label: string }>;
  return options
    .filter((option) => approvalPolicy === 'yolo' || option.id !== 'yolo')
    .map((option, index) => ({
      id: option.id,
      shortLabel: option.label || deriveGeminiModeLabel(option.id),
      badge: option.id === 'yolo'
        ? '무승인'
        : index === 0
          ? '기본'
          : '설정 가능',
    }));
}

export function resolveComposerModels(
  agent: AgentFlavor,
  providerSelections?: ProviderModelSelections,
  legacyCustomModels?: LegacyCustomModels,
): ComposerModelOption[] {
  const baseModels = isSupportedAgentFlavor(agent)
    ? COMPOSER_MODELS_BY_AGENT[agent]
    : COMPOSER_MODELS_BY_AGENT.codex;

  const selectedModelIds = isSupportedAgentFlavor(agent)
    ? (providerSelections?.[agent]?.selectedModelIds ?? [])
    : [];
  if (selectedModelIds.length > 0) {
    return selectedModelIds.map((modelId: string, index: number) => {
      const baseMatch = baseModels.find((item) => item.id === modelId);
      if (baseMatch) {
        return {
          ...baseMatch,
          badge: index === 0 ? '등록됨' : baseMatch.badge,
        };
      }
      return {
        id: modelId,
        shortLabel: agent === 'codex' ? deriveOpenAiModelLabel(modelId) : modelId,
        badge: index === 0 ? '등록됨' : '선택됨',
      };
    });
  }

  if (legacyCustomModels) {
    const customId = legacyCustomModels[agent];
    if (customId && customId.trim() !== '') {
      const trimmed = customId.trim();
      return [
        { id: trimmed, shortLabel: trimmed, badge: '커스텀' },
        ...baseModels.filter((model) => model.id !== trimmed),
      ];
    }
  }
  return baseModels;
}

export function resolveDefaultModelId(
  agent: AgentFlavor,
  providerSelections?: ProviderModelSelections,
  legacyCustomModels?: LegacyCustomModels,
  cachedModelId?: string | null,
): string {
  const availableModels = resolveComposerModels(agent, providerSelections, legacyCustomModels);
  if (isSupportedAgentFlavor(agent)) {
    const preferred = resolvePreferredModelId({
      availableModelIds: availableModels.map((model) => model.id),
      cachedModelId: agent === 'codex' ? cachedModelId : null,
      configuredDefaultModelId: normalizeModelId(providerSelections?.[agent]?.defaultModelId),
      fallbackModelId: 'gpt-5.4',
    });
    return preferred ?? 'gpt-5.4';
  }
  return availableModels[0]?.id ?? 'gpt-5.4';
}

function resolvePreferredModelId(input: {
  availableModelIds: string[];
  cachedModelId?: string | null;
  configuredDefaultModelId?: string | null;
  fallbackModelId: string;
}): string | null {
  const availableModelIds = new Set(input.availableModelIds);
  if (input.cachedModelId && availableModelIds.has(input.cachedModelId)) {
    return input.cachedModelId;
  }
  if (input.configuredDefaultModelId && availableModelIds.has(input.configuredDefaultModelId)) {
    return input.configuredDefaultModelId;
  }
  if (availableModelIds.has(input.fallbackModelId)) {
    return input.fallbackModelId;
  }
  return input.availableModelIds[0] ?? null;
}

export function resolveAvailableComposerModelId(input: {
  agent: AgentFlavor;
  requestedModel?: unknown;
  sessionModelFallback?: unknown;
  providerSelections?: ProviderModelSelections;
  legacyCustomModels?: LegacyCustomModels;
}): string {
  const availableModels = resolveComposerModels(
    input.agent,
    input.providerSelections,
    input.legacyCustomModels,
  );
  const availableIds = new Set(availableModels.map((model) => model.id));
  const requestedModel = normalizeModelId(input.requestedModel);
  if (requestedModel && availableIds.has(requestedModel)) {
    return requestedModel;
  }
  const sessionModelFallback = normalizeModelId(input.sessionModelFallback);
  if (sessionModelFallback && availableIds.has(sessionModelFallback)) {
    return sessionModelFallback;
  }
  return availableModels[0]?.id ?? 'gpt-5.4';
}

export function resolveDefaultGeminiModeId(
  approvalPolicy?: ApprovalPolicy,
  configuredModeId?: unknown,
): string {
  const availableModes = resolveGeminiModeOptions(approvalPolicy);
  if (approvalPolicy === 'yolo' && availableModes.some((mode) => mode.id === 'yolo')) {
    return 'yolo';
  }
  const configuredMode = normalizeGeminiModeId(configuredModeId);
  if (configuredMode && availableModes.some((mode) => mode.id === configuredMode)) {
    return configuredMode;
  }
  return availableModes[0]?.id ?? DEFAULT_GEMINI_MODE_ID;
}

export function resolveAvailableGeminiModeId(input: {
  requestedMode?: unknown;
  approvalPolicy?: ApprovalPolicy;
  configuredModeId?: unknown;
}): string {
  const availableModes = resolveGeminiModeOptions(input.approvalPolicy);
  const availableIds = new Set(availableModes.map((mode) => mode.id));
  const requestedMode = normalizeGeminiModeId(input.requestedMode);
  if (requestedMode && availableIds.has(requestedMode)) {
    if (requestedMode === 'yolo' && input.approvalPolicy !== 'yolo') {
      return resolveDefaultGeminiModeId(input.approvalPolicy, input.configuredModeId);
    }
    return requestedMode;
  }
  return resolveDefaultGeminiModeId(input.approvalPolicy, input.configuredModeId);
}
