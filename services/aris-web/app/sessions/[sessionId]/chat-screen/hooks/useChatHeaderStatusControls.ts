'use client';

import { useCallback, type Dispatch, type MutableRefObject, type SetStateAction } from 'react';
import type { ApprovalPolicy, SessionChat, UiEvent } from '@/lib/happy/types';
import type { ChatRuntimeUiState, ChatSubmittedPayload } from '../types';

type CopyState = 'idle' | 'copied' | 'failed';
type SetCopyState = Dispatch<SetStateAction<CopyState>>;
type SetBooleanState = Dispatch<SetStateAction<boolean>>;

type UseChatHeaderStatusControlsParams = {
  activeChat: SessionChat | null;
  activeChatIdResolved: string | null;
  addEvent: (event: UiEvent) => void;
  disconnectNoticeAwaitingRef: MutableRefObject<string | null>;
  firstPendingPermissionId: string | null;
  isAgentRunning: boolean;
  isOperator: boolean;
  lastSubmittedPayload: ChatSubmittedPayload | null;
  sessionId: string;
  setApprovalPolicy: (value: ApprovalPolicy) => void;
  setChatIdCopyState: SetCopyState;
  setIdBundleCopyState: SetCopyState;
  setIsChatSidebarOpen: SetBooleanState;
  setIsContextMenuOpen: SetBooleanState;
  setIsPolicyChanging: (value: boolean) => void;
  setShowPermissionQueue: SetBooleanState;
  updateChatRuntimeUi: (chatId: string | null, patch: Partial<ChatRuntimeUiState>) => void;
  runtimeStartedSinceAwaitingRef: MutableRefObject<boolean>;
};

function scheduleCopyStateReset(setState: SetCopyState, targetState: Exclude<CopyState, 'idle'>, delayMs: number) {
  window.setTimeout(() => {
    setState((current) => (current === targetState ? 'idle' : current));
  }, delayMs);
}

export function useChatHeaderStatusControls({
  activeChat,
  activeChatIdResolved,
  addEvent,
  disconnectNoticeAwaitingRef,
  firstPendingPermissionId,
  isAgentRunning,
  isOperator,
  lastSubmittedPayload,
  sessionId,
  setApprovalPolicy,
  setChatIdCopyState,
  setIdBundleCopyState,
  setIsChatSidebarOpen,
  setIsContextMenuOpen,
  setIsPolicyChanging,
  setShowPermissionQueue,
  updateChatRuntimeUi,
  runtimeStartedSinceAwaitingRef,
}: UseChatHeaderStatusControlsParams) {
  const jumpToPendingPermission = useCallback(() => {
    if (!firstPendingPermissionId) {
      return;
    }

    setShowPermissionQueue(true);
    requestAnimationFrame(() => {
      const target = document.getElementById(`permission-${firstPendingPermissionId}`);
      if (!target) {
        return;
      }
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }, [firstPendingPermissionId, setShowPermissionQueue]);

  const handleCopyChatId = useCallback(async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('clipboard-unavailable');
      }
      if (!activeChatIdResolved) {
        throw new Error('chat-id-unavailable');
      }

      await navigator.clipboard.writeText(activeChatIdResolved);
      setChatIdCopyState('copied');
      scheduleCopyStateReset(setChatIdCopyState, 'copied', 1800);
    } catch {
      setChatIdCopyState('failed');
      scheduleCopyStateReset(setChatIdCopyState, 'failed', 2200);
    }
  }, [activeChatIdResolved, setChatIdCopyState]);

  const handleCopyChatThreadIdsJson = useCallback(async () => {
    try {
      if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
        throw new Error('clipboard-unavailable');
      }
      if (!activeChatIdResolved) {
        throw new Error('chat-id-unavailable');
      }

      await navigator.clipboard.writeText(JSON.stringify({
        chatId: activeChatIdResolved,
        threadId: activeChat?.threadId ?? null,
      }, null, 2));
      setIdBundleCopyState('copied');
      scheduleCopyStateReset(setIdBundleCopyState, 'copied', 1800);
    } catch {
      setIdBundleCopyState('failed');
      scheduleCopyStateReset(setIdBundleCopyState, 'failed', 2200);
    }
  }, [activeChat?.threadId, activeChatIdResolved, setIdBundleCopyState]);

  const handleToggleChatSidebar = useCallback(() => {
    setIsChatSidebarOpen((prev) => !prev);
  }, [setIsChatSidebarOpen]);

  const handleToggleContextMenu = useCallback(() => {
    setIsContextMenuOpen((prev) => !prev);
  }, [setIsContextMenuOpen]);

  const handleTogglePermissionQueue = useCallback(() => {
    setShowPermissionQueue((prev) => !prev);
  }, [setShowPermissionQueue]);

  const handleUpdateApprovalPolicy = useCallback((next: ApprovalPolicy) => {
    setIsPolicyChanging(true);
    fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ approvalPolicy: next }),
    })
      .then((response) => {
        if (!response.ok) {
          throw new Error('Failed to update policy');
        }
        setApprovalPolicy(next);
      })
      .catch(() => {})
      .finally(() => {
        setIsPolicyChanging(false);
      });
  }, [sessionId, setApprovalPolicy, setIsPolicyChanging]);

  const handleRetryDisconnected = useCallback(async () => {
    if (!isOperator || isAgentRunning || !lastSubmittedPayload) {
      return;
    }

    const scopedChatId = lastSubmittedPayload.chatId;
    updateChatRuntimeUi(scopedChatId, {
      isSubmitting: true,
      isAwaitingReply: true,
      hasCompletionSignal: false,
      awaitingReplySince: new Date().toISOString(),
      submitError: null,
      showDisconnectRetry: false,
    });
    runtimeStartedSinceAwaitingRef.current = false;
    disconnectNoticeAwaitingRef.current = null;

    try {
      const response = await fetch(`/api/runtime/sessions/${sessionId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'retry',
          chatId: scopedChatId,
        }),
      });

      const body = (await response.json().catch(() => ({ error: '백엔드 응답을 읽을 수 없습니다.' }))) as {
        event?: UiEvent;
        error?: string;
      };

      if (!response.ok) {
        throw new Error(body.error ?? '재시도 전송에 실패했습니다.');
      }

      if (body.event) {
        addEvent(body.event);
      }
    } catch (error) {
      updateChatRuntimeUi(scopedChatId, {
        isAwaitingReply: false,
        hasCompletionSignal: false,
        awaitingReplySince: null,
        submitError: error instanceof Error ? error.message : '재시도 중 오류가 발생했습니다.',
        showDisconnectRetry: true,
      });
      runtimeStartedSinceAwaitingRef.current = false;
    } finally {
      updateChatRuntimeUi(scopedChatId, { isSubmitting: false });
    }
  }, [
    addEvent,
    disconnectNoticeAwaitingRef,
    isAgentRunning,
    isOperator,
    lastSubmittedPayload,
    runtimeStartedSinceAwaitingRef,
    sessionId,
    updateChatRuntimeUi,
  ]);

  return {
    handleCopyChatId,
    handleCopyChatThreadIdsJson,
    handleRetryDisconnected,
    handleToggleChatSidebar,
    handleToggleContextMenu,
    handleTogglePermissionQueue,
    handleUpdateApprovalPolicy,
    jumpToPendingPermission,
  };
}
