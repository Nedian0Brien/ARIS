import { useCallback, useEffect, useRef, useState } from 'react';
import type { PermissionRequest } from '@/lib/happy/types';
import { SIDEBAR_APPROVAL_FEEDBACK_MS } from '../constants';
import type { ChatApprovalFeedback } from '../types';

type Params = {
  decidePermission: (permissionId: string, decision: 'allow_once' | 'allow_session' | 'deny') => Promise<{ success: boolean; error?: string | null }>;
  isOperator: boolean;
  pendingPermissions: PermissionRequest[];
  setChatMutationError: (value: string | null) => void;
};

export function useChatSidebarApprovalState({
  decidePermission,
  isOperator,
  pendingPermissions,
  setChatMutationError,
}: Params) {
  const [approvalFeedbackByChat, setApprovalFeedbackByChat] = useState<Record<string, ChatApprovalFeedback>>({});
  const [sidebarApprovalLoadingChatId, setSidebarApprovalLoadingChatId] = useState<string | null>(null);
  const approvalFeedbackTimersRef = useRef<Record<string, number>>({});

  const scheduleApprovalFeedbackReset = useCallback((chatId: string) => {
    const currentTimer = approvalFeedbackTimersRef.current[chatId];
    if (currentTimer) {
      window.clearTimeout(currentTimer);
    }
    approvalFeedbackTimersRef.current[chatId] = window.setTimeout(() => {
      setApprovalFeedbackByChat((prev) => {
        if (!prev[chatId]) {
          return prev;
        }
        const next = { ...prev };
        delete next[chatId];
        return next;
      });
      delete approvalFeedbackTimersRef.current[chatId];
    }, SIDEBAR_APPROVAL_FEEDBACK_MS);
  }, []);

  const handleSidebarPermissionDecision = useCallback(async (
    chatId: string,
    decision: 'allow_once' | 'allow_session' | 'deny',
  ) => {
    if (!isOperator) {
      return;
    }
    const targetPermission = pendingPermissions[0];
    if (!targetPermission) {
      return;
    }

    setSidebarApprovalLoadingChatId(chatId);
    setChatMutationError(null);
    const result = await decidePermission(targetPermission.id, decision);
    setSidebarApprovalLoadingChatId(null);

    if (!result.success) {
      setChatMutationError(result.error ?? '승인 요청 처리에 실패했습니다.');
      return;
    }

    setApprovalFeedbackByChat((prev) => ({
      ...prev,
      [chatId]: decision === 'deny' ? 'denied' : 'approved',
    }));
    scheduleApprovalFeedbackReset(chatId);
  }, [
    decidePermission,
    isOperator,
    pendingPermissions,
    scheduleApprovalFeedbackReset,
    setChatMutationError,
  ]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(approvalFeedbackTimersRef.current)) {
        window.clearTimeout(timerId);
      }
      approvalFeedbackTimersRef.current = {};
    };
  }, []);

  return {
    approvalFeedbackByChat,
    handleSidebarPermissionDecision,
    setApprovalFeedbackByChat,
    setSidebarApprovalLoadingChatId,
    sidebarApprovalLoadingChatId,
  };
}
