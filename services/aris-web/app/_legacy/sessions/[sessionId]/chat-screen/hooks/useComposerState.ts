import { useEffect, useState } from 'react';
import type { AgentFlavor, ApprovalPolicy, SessionChat } from '@/lib/happy/types';
import { DEFAULT_GEMINI_MODE_ID, type ProviderModelSelections } from '@/lib/settings/providerModels';
import { readLastSelectedModelId } from '../../chatModelPreferences';
import type {
  ComposerModelId,
  ContextItem,
  LegacyCustomModels,
  ModelReasoningEffort,
} from '../types';
import {
  normalizeAgentFlavor,
  normalizeModelId,
  normalizeModelReasoningEffort,
  resolveAvailableComposerModelId,
  resolveAvailableGeminiModeId,
  sortSessionChats,
} from '../helpers';
import type { UsageCommandProvider } from '../../chatCommands';

type UseComposerStateParams = {
  initialChats: SessionChat[];
  activeChatId: string | null;
  activeChat: SessionChat | null;
  activeAgentFlavor: AgentFlavor;
  defaultAgentFlavor: AgentFlavor;
  agentFlavor: string;
  approvalPolicy?: ApprovalPolicy;
  sessionModel?: string | null;
  providerSelections?: ProviderModelSelections;
  legacyCustomModels?: LegacyCustomModels | null;
};

export function useComposerState({
  initialChats,
  activeChatId,
  activeChat,
  activeAgentFlavor,
  defaultAgentFlavor,
  agentFlavor,
  approvalPolicy,
  sessionModel,
  providerSelections,
  legacyCustomModels,
}: UseComposerStateParams) {
  const [prompt, setPrompt] = useState('');
  const [contextItems, setContextItems] = useState<ContextItem[]>([]);
  const [plusMenuMode, setPlusMenuMode] = useState<'closed' | 'menu' | 'file' | 'text'>('closed');
  const [textContextInput, setTextContextInput] = useState('');
  const [imageUploadsInFlight, setImageUploadsInFlight] = useState(0);
  const [imageUploadError, setImageUploadError] = useState<string | null>(null);
  const [selectedModelId, setSelectedModelId] = useState<ComposerModelId>(() => {
    const sortedInitialChats = sortSessionChats(initialChats);
    const initialChat = (activeChatId && activeChatId.trim().length > 0
      ? sortedInitialChats.find((chat) => chat.id === activeChatId.trim())
      : null) ?? sortedInitialChats[0] ?? null;
    const sessionAgent = normalizeAgentFlavor(agentFlavor, 'codex');
    const initialAgent = normalizeAgentFlavor(initialChat?.agent, sessionAgent);
    const sessionModelFallback = initialAgent === sessionAgent ? normalizeModelId(sessionModel) : null;
    return resolveAvailableComposerModelId({
      agent: initialAgent,
      requestedModel: initialChat?.model,
      sessionModelFallback,
      providerSelections,
      legacyCustomModels: legacyCustomModels ?? undefined,
    });
  });
  const [selectedModelReasoningEffort, setSelectedModelReasoningEffort] = useState<ModelReasoningEffort>(() => {
    const sortedInitialChats = sortSessionChats(initialChats);
    const initialChat = (activeChatId && activeChatId.trim().length > 0
      ? sortedInitialChats.find((chat) => chat.id === activeChatId.trim())
      : null) ?? sortedInitialChats[0] ?? null;
    const sessionAgent = normalizeAgentFlavor(agentFlavor, 'codex');
    const initialAgent = normalizeAgentFlavor(initialChat?.agent, sessionAgent);
    if (initialAgent !== 'codex') {
      return 'medium';
    }
    return normalizeModelReasoningEffort(initialChat?.modelReasoningEffort, 'medium');
  });
  const [selectedGeminiModeId, setSelectedGeminiModeId] = useState<string>(() => {
    const sortedInitialChats = sortSessionChats(initialChats);
    const initialChat = (activeChatId && activeChatId.trim().length > 0
      ? sortedInitialChats.find((chat) => chat.id === activeChatId.trim())
      : null) ?? sortedInitialChats[0] ?? null;
    return resolveAvailableGeminiModeId({
      requestedMode: initialChat?.geminiMode,
      approvalPolicy,
      configuredModeId: providerSelections?.gemini?.defaultModeId ?? DEFAULT_GEMINI_MODE_ID,
    });
  });
  const [isModelDropdownOpen, setIsModelDropdownOpen] = useState(false);
  const [isGeminiModeDropdownOpen, setIsGeminiModeDropdownOpen] = useState(false);
  const [isCommandMenuOpen, setIsCommandMenuOpen] = useState(false);
  const [usageProbeProvider, setUsageProbeProvider] = useState<UsageCommandProvider | null>(null);
  const [copiedUserEventId, setCopiedUserEventId] = useState<string | null>(null);
  const [lastSelectedCodexModelId, setLastSelectedCodexModelId] = useState<string | null>(() => readLastSelectedModelId('codex'));

  useEffect(() => {
    if (!copiedUserEventId) {
      return undefined;
    }
    const timeout = window.setTimeout(() => {
      setCopiedUserEventId((current) => (current === copiedUserEventId ? null : current));
    }, 2000);
    return () => window.clearTimeout(timeout);
  }, [copiedUserEventId]);

  useEffect(() => {
    const sessionModelFallback = activeAgentFlavor === defaultAgentFlavor
      ? normalizeModelId(sessionModel)
      : null;
    const nextModelId = resolveAvailableComposerModelId({
      agent: activeAgentFlavor,
      requestedModel: activeChat?.model,
      sessionModelFallback,
      providerSelections,
      legacyCustomModels: legacyCustomModels ?? undefined,
    });
    if (nextModelId === selectedModelId) {
      return;
    }
    setSelectedModelId(nextModelId);
  }, [
    activeAgentFlavor,
    activeChat?.id,
    activeChat?.model,
    defaultAgentFlavor,
    legacyCustomModels,
    providerSelections,
    selectedModelId,
    sessionModel,
  ]);

  useEffect(() => {
    if (activeAgentFlavor !== 'gemini') {
      if (selectedGeminiModeId !== 'default') {
        setSelectedGeminiModeId('default');
      }
      return;
    }
    const nextModeId = resolveAvailableGeminiModeId({
      requestedMode: activeChat?.geminiMode ?? providerSelections?.gemini?.defaultModeId,
      approvalPolicy,
      configuredModeId: providerSelections?.gemini?.defaultModeId,
    });
    if (nextModeId === selectedGeminiModeId) {
      return;
    }
    setSelectedGeminiModeId(nextModeId);
  }, [
    activeAgentFlavor,
    activeChat?.geminiMode,
    activeChat?.id,
    approvalPolicy,
    providerSelections?.gemini?.defaultModeId,
    selectedGeminiModeId,
  ]);

  useEffect(() => {
    if (activeAgentFlavor !== 'codex') {
      if (selectedModelReasoningEffort !== 'medium') {
        setSelectedModelReasoningEffort('medium');
      }
      return;
    }
    const nextEffort = normalizeModelReasoningEffort(activeChat?.modelReasoningEffort, 'medium');
    if (nextEffort === selectedModelReasoningEffort) {
      return;
    }
    setSelectedModelReasoningEffort(nextEffort);
  }, [activeAgentFlavor, activeChat?.id, activeChat?.modelReasoningEffort, selectedModelReasoningEffort]);

  return {
    contextItems,
    copiedUserEventId,
    imageUploadError,
    imageUploadsInFlight,
    isCommandMenuOpen,
    isGeminiModeDropdownOpen,
    isModelDropdownOpen,
    lastSelectedCodexModelId,
    plusMenuMode,
    prompt,
    selectedGeminiModeId,
    selectedModelId,
    selectedModelReasoningEffort,
    setContextItems,
    setCopiedUserEventId,
    setImageUploadError,
    setImageUploadsInFlight,
    setIsCommandMenuOpen,
    setIsGeminiModeDropdownOpen,
    setIsModelDropdownOpen,
    setLastSelectedCodexModelId,
    setPlusMenuMode,
    setPrompt,
    setSelectedGeminiModeId,
    setSelectedModelId,
    setSelectedModelReasoningEffort,
    setTextContextInput,
    setUsageProbeProvider,
    textContextInput,
    usageProbeProvider,
  };
}
