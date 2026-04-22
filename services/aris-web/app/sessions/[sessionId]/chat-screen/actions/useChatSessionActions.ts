'use client';

import { useCallback, useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import type { AgentFlavor, ApprovalPolicy, SessionChat } from '@/lib/happy/types';
import {
  normalizeModelId,
  normalizeGeminiModeId,
  normalizeModelReasoningEffort,
  resolveDefaultGeminiModeId,
  resolveDefaultModelId,
  sortSessionChats,
  writeChatIdToHistory,
} from '../helpers';
import { writeLastSelectedModelId } from '../../chatModelPreferences';
import type { LegacyCustomModels, ModelReasoningEffort } from '../types';

type Params = {
  activeAgentFlavor: AgentFlavor;
  activeChat: SessionChat | null;
  activeChatIdResolved: string | null;
  approvalPolicy?: ApprovalPolicy;
  isMobileLayout: boolean;
  lastSelectedCodexModelId?: string | null;
  legacyCustomModels?: LegacyCustomModels | null;
  providerSelections?: Parameters<typeof resolveDefaultModelId>[1];
  selectedModelReasoningEffort: ModelReasoningEffort;
  sessionId: string;
  setChats: Dispatch<SetStateAction<SessionChat[]>>;
  setIsChatSidebarOpen: (value: boolean) => void;
  setIsGeminiModeDropdownOpen: (value: boolean) => void;
  setIsModelDropdownOpen: (value: boolean) => void;
  setIsNewChatPlaceholder: (value: boolean) => void;
  setLastSelectedCodexModelId: (value: string) => void;
  setSelectedChatId: (value: string | null) => void;
  setSelectedGeminiModeId: (value: string) => void;
  setSelectedModelId: (value: string) => void;
  setSelectedModelReasoningEffort: (value: ModelReasoningEffort) => void;
};

export function useChatSessionActions({
  activeAgentFlavor,
  activeChat,
  activeChatIdResolved,
  approvalPolicy,
  isMobileLayout,
  lastSelectedCodexModelId,
  legacyCustomModels,
  providerSelections,
  selectedModelReasoningEffort,
  sessionId,
  setChats,
  setIsChatSidebarOpen,
  setIsGeminiModeDropdownOpen,
  setIsModelDropdownOpen,
  setIsNewChatPlaceholder,
  setLastSelectedCodexModelId,
  setSelectedChatId,
  setSelectedGeminiModeId,
  setSelectedModelId,
  setSelectedModelReasoningEffort,
}: Params) {
  const [chatActionMenuId, setChatActionMenuId] = useState<string | null>(null);
  const [chatActionMenuRect, setChatActionMenuRect] = useState<DOMRect | null>(null);
  const [renamingChatId, setRenamingChatId] = useState<string | null>(null);
  const [chatTitleDraft, setChatTitleDraft] = useState('');
  const [chatMutationLoadingId, setChatMutationLoadingId] = useState<string | null>(null);
  const [chatMutationError, setChatMutationError] = useState<string | null>(null);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const buildChatUrlForChat = useCallback((chatId: string) => (
    `/sessions/${encodeURIComponent(sessionId)}?chat=${encodeURIComponent(chatId)}`
  ), [sessionId]);

  const resetChatUiState = useCallback(() => {
    setChatActionMenuId(null);
    setChatActionMenuRect(null);
    setRenamingChatId(null);
    setChatTitleDraft('');
  }, []);

  const closeSidebarMenu = useCallback(() => {
    setChatActionMenuId(null);
    setChatActionMenuRect(null);
  }, []);

  const goToChat = useCallback((chatId: string) => {
    setIsNewChatPlaceholder(false);
    resetChatUiState();
    setSelectedChatId(chatId);
    writeChatIdToHistory(buildChatUrlForChat(chatId));

    if (isMobileLayout) {
      setIsChatSidebarOpen(false);
    }
  }, [
    buildChatUrlForChat,
    isMobileLayout,
    resetChatUiState,
    setIsChatSidebarOpen,
    setIsNewChatPlaceholder,
    setSelectedChatId,
  ]);

  const handleSelectModel = useCallback(async (modelId: string) => {
    const normalizedModelId = normalizeModelId(modelId);
    if (!activeChatIdResolved || !normalizedModelId) {
      return;
    }
    setSelectedModelId(normalizedModelId);
    if (activeAgentFlavor === 'codex') {
      setLastSelectedCodexModelId(normalizedModelId);
      writeLastSelectedModelId('codex', normalizedModelId);
    }
    setIsModelDropdownOpen(false);
    setChatMutationError(null);
    setChats((prev) => sortSessionChats(prev.map((chat) => (
      chat.id === activeChatIdResolved ? { ...chat, model: normalizedModelId } : chat
    ))));
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(activeChatIdResolved)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: normalizedModelId }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { chat?: SessionChat; error?: string };
      if (!response.ok || !payload.chat) {
        throw new Error(payload.error ?? '모델 설정 저장에 실패했습니다.');
      }
      setChats((prev) => sortSessionChats(prev.map((chat) => (
        chat.id === payload.chat?.id ? payload.chat : chat
      ))));
    } catch (error) {
      setChatMutationError(error instanceof Error ? error.message : '모델 설정 저장에 실패했습니다.');
    }
  }, [
    activeAgentFlavor,
    activeChatIdResolved,
    sessionId,
    setChats,
    setIsModelDropdownOpen,
    setLastSelectedCodexModelId,
    setSelectedModelId,
  ]);

  const handleSelectGeminiMode = useCallback(async (modeId: string) => {
    const normalizedModeId = normalizeGeminiModeId(modeId);
    if (!activeChatIdResolved || !normalizedModeId || activeAgentFlavor !== 'gemini') {
      return;
    }
    if (normalizedModeId === 'yolo' && approvalPolicy !== 'yolo') {
      setChatMutationError('YOLO 모드는 세션 승인 정책이 yolo일 때만 사용할 수 있습니다.');
      return;
    }
    const previousModeId = normalizeGeminiModeId(activeChat?.geminiMode) ?? 'default';
    setSelectedGeminiModeId(normalizedModeId);
    setIsGeminiModeDropdownOpen(false);
    setChatMutationError(null);
    setChats((prev) => sortSessionChats(prev.map((chat) => (
      chat.id === activeChatIdResolved ? { ...chat, geminiMode: normalizedModeId } : chat
    ))));
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(activeChatIdResolved)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ geminiMode: normalizedModeId }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { chat?: SessionChat; error?: string };
      if (!response.ok || !payload.chat) {
        throw new Error(payload.error ?? 'Gemini mode 저장에 실패했습니다.');
      }
      setChats((prev) => sortSessionChats(prev.map((chat) => (
        chat.id === payload.chat?.id ? payload.chat : chat
      ))));
    } catch (error) {
      setSelectedGeminiModeId(previousModeId);
      setChats((prev) => sortSessionChats(prev.map((chat) => (
        chat.id === activeChatIdResolved ? { ...chat, geminiMode: previousModeId } : chat
      ))));
      setChatMutationError(error instanceof Error ? error.message : 'Gemini mode 저장에 실패했습니다.');
    }
  }, [
    activeAgentFlavor,
    activeChat?.geminiMode,
    activeChatIdResolved,
    approvalPolicy,
    sessionId,
    setChats,
    setIsGeminiModeDropdownOpen,
    setSelectedGeminiModeId,
  ]);

  const handleSelectModelReasoningEffort = useCallback(async (value: unknown) => {
    const normalizedEffort = normalizeModelReasoningEffort(value, 'medium');
    setSelectedModelReasoningEffort(normalizedEffort);
    if (!activeChatIdResolved || activeAgentFlavor !== 'codex') {
      return;
    }
    setChatMutationError(null);
    const previousEffort = normalizeModelReasoningEffort(activeChat?.modelReasoningEffort, 'medium');
    setChats((prev) => sortSessionChats(prev.map((chat) => (
      chat.id === activeChatIdResolved ? { ...chat, modelReasoningEffort: normalizedEffort } : chat
    ))));
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(activeChatIdResolved)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelReasoningEffort: normalizedEffort }),
        },
      );
      const payload = (await response.json().catch(() => ({}))) as { chat?: SessionChat; error?: string };
      if (!response.ok || !payload.chat) {
        throw new Error(payload.error ?? '모델 effort 저장에 실패했습니다.');
      }
      setChats((prev) => sortSessionChats(prev.map((chat) => (
        chat.id === payload.chat?.id ? payload.chat : chat
      ))));
    } catch (error) {
      setSelectedModelReasoningEffort(previousEffort);
      setChats((prev) => sortSessionChats(prev.map((chat) => (
        chat.id === activeChatIdResolved ? { ...chat, modelReasoningEffort: previousEffort } : chat
      ))));
      setChatMutationError(error instanceof Error ? error.message : '모델 effort 저장에 실패했습니다.');
    }
  }, [
    activeAgentFlavor,
    activeChat?.modelReasoningEffort,
    activeChatIdResolved,
    sessionId,
    setChats,
    setSelectedModelReasoningEffort,
  ]);

  const handleCreateChat = useCallback(async (agent: AgentFlavor) => {
    if (isCreatingChat) {
      return;
    }
    setIsCreatingChat(true);
    setChatMutationError(null);
    const defaultModelId = resolveDefaultModelId(
      agent,
      providerSelections,
      legacyCustomModels ?? undefined,
      lastSelectedCodexModelId ?? undefined,
    );
    const defaultGeminiModeId = agent === 'gemini'
      ? resolveDefaultGeminiModeId(approvalPolicy, providerSelections?.gemini?.defaultModeId)
      : undefined;
    try {
      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent,
          model: defaultModelId,
          ...(defaultGeminiModeId ? { geminiMode: defaultGeminiModeId } : {}),
          ...(agent === 'codex' ? { modelReasoningEffort: selectedModelReasoningEffort } : {}),
        }),
      });
      const body = (await response.json().catch(() => ({}))) as { chat?: SessionChat; error?: string };
      if (!response.ok || !body.chat) {
        throw new Error(body.error ?? '새 채팅 생성에 실패했습니다.');
      }
      setChats((prev) => sortSessionChats([body.chat!, ...prev]));
      goToChat(body.chat.id);
    } catch (error) {
      setChatMutationError(error instanceof Error ? error.message : '새 채팅 생성에 실패했습니다.');
    } finally {
      setIsCreatingChat(false);
    }
  }, [
    approvalPolicy,
    goToChat,
    isCreatingChat,
    lastSelectedCodexModelId,
    legacyCustomModels,
    providerSelections,
    selectedModelReasoningEffort,
    sessionId,
    setChats,
  ]);

  const handleToggleChatPin = useCallback(async (chat: SessionChat) => {
    setChatMutationLoadingId(chat.id);
    setChatMutationError(null);
    const nextPinned = !chat.isPinned;
    setChats((prev) => sortSessionChats(prev.map((item) => (
      item.id === chat.id ? { ...item, isPinned: nextPinned } : item
    ))));
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(chat.id)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ isPinned: nextPinned }),
        },
      );
      if (!response.ok) {
        throw new Error('채팅 고정 상태 변경에 실패했습니다.');
      }
    } catch (error) {
      setChats((prev) => sortSessionChats(prev.map((item) => (
        item.id === chat.id ? { ...item, isPinned: chat.isPinned } : item
      ))));
      setChatMutationError(error instanceof Error ? error.message : '채팅 고정 상태 변경에 실패했습니다.');
    } finally {
      setChatMutationLoadingId(null);
      closeSidebarMenu();
    }
  }, [closeSidebarMenu, sessionId, setChats]);

  const handleRenameChat = useCallback(async (chatId: string, nextTitle: string) => {
    const normalized = nextTitle.trim();
    if (!normalized) {
      setRenamingChatId(null);
      setChatTitleDraft('');
      return;
    }
    setChatMutationLoadingId(chatId);
    setChatMutationError(null);
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(chatId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: normalized }),
        },
      );
      const body = (await response.json().catch(() => ({}))) as { chat?: SessionChat; error?: string };
      if (!response.ok || !body.chat) {
        throw new Error(body.error ?? '채팅 이름 변경에 실패했습니다.');
      }
      setChats((prev) => sortSessionChats(prev.map((chat) => (
        chat.id === chatId ? { ...chat, title: body.chat!.title } : chat
      ))));
      setRenamingChatId(null);
      setChatTitleDraft('');
    } catch (error) {
      setChatMutationError(error instanceof Error ? error.message : '채팅 이름 변경에 실패했습니다.');
    } finally {
      setChatMutationLoadingId(null);
    }
  }, [sessionId, setChats]);

  const handleDeleteChat = useCallback(async (chat: SessionChat) => {
    if (chatMutationLoadingId) {
      return;
    }
    const confirmed = window.confirm(`'${chat.title}' 채팅을 삭제할까요?`);
    if (!confirmed) {
      return;
    }
    setChatMutationLoadingId(chat.id);
    setChatMutationError(null);
    try {
      const response = await fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(chat.id)}`,
        { method: 'DELETE' },
      );
      const body = (await response.json().catch(() => ({}))) as { chats?: SessionChat[]; error?: string };
      if (!response.ok || !Array.isArray(body.chats)) {
        throw new Error(body.error ?? '채팅 삭제에 실패했습니다.');
      }
      const nextChats = sortSessionChats(body.chats);
      setChats(nextChats);
      closeSidebarMenu();
      if (chat.id === activeChatIdResolved && nextChats[0]) {
        goToChat(nextChats[0].id);
      }
    } catch (error) {
      setChatMutationError(error instanceof Error ? error.message : '채팅 삭제에 실패했습니다.');
    } finally {
      setChatMutationLoadingId(null);
    }
  }, [activeChatIdResolved, chatMutationLoadingId, closeSidebarMenu, goToChat, sessionId, setChats]);

  const handleSidebarChatMenuToggle = useCallback((chatId: string, rect: DOMRect) => {
    if (chatActionMenuId === chatId) {
      setChatActionMenuId(null);
      setChatActionMenuRect(null);
      return;
    }
    setChatActionMenuId(chatId);
    setChatActionMenuRect(rect);
  }, [chatActionMenuId]);

  const handleSidebarTitleDraftChange = useCallback((value: string) => {
    setChatTitleDraft(value);
  }, []);

  const handleSidebarRenameSubmit = useCallback((chatId: string, nextTitle: string) => {
    void handleRenameChat(chatId, nextTitle);
  }, [handleRenameChat]);

  const handleSidebarRenameCancel = useCallback(() => {
    setRenamingChatId(null);
    setChatTitleDraft('');
  }, []);

  const handleSidebarStartRename = useCallback((chat: SessionChat) => {
    setRenamingChatId(chat.id);
    setChatTitleDraft(chat.title);
    setChatActionMenuId(null);
    setChatActionMenuRect(null);
  }, []);

  return {
    buildChatUrlForChat,
    chatActionMenuId,
    chatActionMenuRect,
    chatMutationError,
    chatMutationLoadingId,
    chatTitleDraft,
    closeSidebarMenu,
    goToChat,
    handleCreateChat,
    handleDeleteChat,
    handleRenameChat,
    handleSelectGeminiMode,
    handleSelectModel,
    handleSelectModelReasoningEffort,
    handleSidebarChatMenuToggle,
    handleSidebarRenameCancel,
    handleSidebarRenameSubmit,
    handleSidebarStartRename,
    handleSidebarTitleDraftChange,
    handleToggleChatPin,
    isCreatingChat,
    renamingChatId,
    resetChatUiState,
    setChatMutationError,
  };
}
