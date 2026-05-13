'use client';

import { useCallback, type Dispatch, type SetStateAction } from 'react';
import type { AppRouterInstance } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { buildChatUrl, writeChatIdToHistory } from '../helpers';

type SetBooleanState = Dispatch<SetStateAction<boolean>>;

type UseChatCenterNavigationActionsParams = {
  isMobileLayout: boolean;
  router: AppRouterInstance;
  sessionId: string;
  setIsChatSidebarOpen: SetBooleanState;
  setIsNewChatPlaceholder: (value: boolean) => void;
  setIsWorkspaceHome: (value: boolean) => void;
  setSelectedChatId: (value: string | null) => void;
};

export function useChatCenterNavigationActions({
  isMobileLayout,
  router,
  sessionId,
  setIsChatSidebarOpen,
  setIsNewChatPlaceholder,
  setIsWorkspaceHome,
  setSelectedChatId,
}: UseChatCenterNavigationActionsParams) {
  const handleGoHome = useCallback(() => {
    setIsWorkspaceHome(true);
    setIsNewChatPlaceholder(false);
    setSelectedChatId(null);
    if (isMobileLayout) {
      setIsChatSidebarOpen(false);
    }
  }, [
    isMobileLayout,
    setIsChatSidebarOpen,
    setIsNewChatPlaceholder,
    setIsWorkspaceHome,
    setSelectedChatId,
  ]);

  const handleOpenNewChat = useCallback(() => {
    setIsWorkspaceHome(false);
    setIsNewChatPlaceholder(true);
    setSelectedChatId(null);
    if (isMobileLayout) {
      setIsChatSidebarOpen(false);
    }
  }, [
    isMobileLayout,
    setIsChatSidebarOpen,
    setIsNewChatPlaceholder,
    setIsWorkspaceHome,
    setSelectedChatId,
  ]);

  const handleSelectWorkspaceChat = useCallback((chatId: string) => {
    setIsWorkspaceHome(false);
    setIsNewChatPlaceholder(false);
    setSelectedChatId(chatId);
    writeChatIdToHistory(buildChatUrl(sessionId, chatId), 'push');
  }, [
    sessionId,
    setIsNewChatPlaceholder,
    setIsWorkspaceHome,
    setSelectedChatId,
  ]);

  const handleBackFromWorkspaceHome = useCallback(() => {
    router.back();
  }, [router]);

  const handleReturnToWorkspaceHome = useCallback(() => {
    setIsWorkspaceHome(true);
    setIsNewChatPlaceholder(false);
  }, [setIsNewChatPlaceholder, setIsWorkspaceHome]);

  return {
    handleBackFromWorkspaceHome,
    handleGoHome,
    handleOpenNewChat,
    handleReturnToWorkspaceHome,
    handleSelectWorkspaceChat,
  };
}
