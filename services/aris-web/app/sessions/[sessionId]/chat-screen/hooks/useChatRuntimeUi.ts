import { useCallback, useEffect, useState } from 'react';
import { AUX_SYNC_INITIAL_DELAY_MS, DEFAULT_CHAT_RUNTIME_UI_STATE } from '../constants';
import type { ChatRuntimeUiState } from '../types';

type UseChatRuntimeUiParams = {
  sessionId: string;
  activeChatIdResolved: string | null;
};

export function useChatRuntimeUi({
  sessionId,
  activeChatIdResolved,
}: UseChatRuntimeUiParams) {
  const [chatRuntimeUiByChat, setChatRuntimeUiByChat] = useState<Record<string, ChatRuntimeUiState>>({});
  const activeChatRuntimeUi = activeChatIdResolved
    ? (chatRuntimeUiByChat[activeChatIdResolved] ?? DEFAULT_CHAT_RUNTIME_UI_STATE)
    : DEFAULT_CHAT_RUNTIME_UI_STATE;
  const [isAuxSyncReady, setIsAuxSyncReady] = useState(false);

  useEffect(() => {
    setIsAuxSyncReady(false);
    const complete = () => {
      setIsAuxSyncReady(true);
    };
    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const handle = window.requestIdleCallback(complete, { timeout: AUX_SYNC_INITIAL_DELAY_MS });
      return () => {
        window.cancelIdleCallback(handle);
      };
    }
    const timer = setTimeout(complete, AUX_SYNC_INITIAL_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [sessionId, activeChatIdResolved]);

  const updateChatRuntimeUi = useCallback((chatId: string | null, patch: Partial<ChatRuntimeUiState>) => {
    if (!chatId) {
      return;
    }
    setChatRuntimeUiByChat((prev) => {
      const current = prev[chatId] ?? DEFAULT_CHAT_RUNTIME_UI_STATE;
      const next = {
        ...current,
        ...patch,
      };
      if (
        current.isSubmitting === next.isSubmitting
        && current.isAwaitingReply === next.isAwaitingReply
        && current.isAborting === next.isAborting
        && current.hasCompletionSignal === next.hasCompletionSignal
        && current.awaitingReplySince === next.awaitingReplySince
        && current.showDisconnectRetry === next.showDisconnectRetry
        && current.lastSubmittedPayload === next.lastSubmittedPayload
        && current.submitError === next.submitError
      ) {
        return prev;
      }
      return {
        ...prev,
        [chatId]: next,
      };
    });
  }, []);

  const updateActiveChatRuntimeUi = useCallback((patch: Partial<ChatRuntimeUiState>) => {
    updateChatRuntimeUi(activeChatIdResolved, patch);
  }, [activeChatIdResolved, updateChatRuntimeUi]);

  const setIsAwaitingReply = useCallback((value: boolean) => {
    updateActiveChatRuntimeUi({ isAwaitingReply: value });
  }, [updateActiveChatRuntimeUi]);

  const setAwaitingReplySince = useCallback((value: string | null) => {
    updateActiveChatRuntimeUi({ awaitingReplySince: value });
  }, [updateActiveChatRuntimeUi]);

  const setShowDisconnectRetry = useCallback((value: boolean) => {
    updateActiveChatRuntimeUi({ showDisconnectRetry: value });
  }, [updateActiveChatRuntimeUi]);

  const setSubmitError = useCallback((value: string | null) => {
    updateActiveChatRuntimeUi({ submitError: value });
  }, [updateActiveChatRuntimeUi]);

  return {
    activeChatRuntimeUi,
    chatRuntimeUiByChat,
    isAuxSyncReady,
    setAwaitingReplySince,
    setIsAwaitingReply,
    setSubmitError,
    setShowDisconnectRetry,
    updateActiveChatRuntimeUi,
    updateChatRuntimeUi,
  };
}
