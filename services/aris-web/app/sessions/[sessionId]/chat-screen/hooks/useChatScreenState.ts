import { useEffect, useMemo, useState } from 'react';
import type { ApprovalPolicy, SessionChat } from '@/lib/happy/types';
import type { ModelSettingsResponse } from '@/lib/settings/providerModels';
import { resolveActiveChat, resolveNextSelectedChatId } from '../../chatSelection';
import { buildChatUrl, readChatIdFromLocation, sortSessionChats, writeChatIdToHistory } from '../helpers';

type UseChatScreenStateParams = {
  sessionId: string;
  initialApprovalPolicy?: ApprovalPolicy;
  initialChats: SessionChat[];
  activeChatId: string | null;
  initialShowWorkspaceHome?: boolean;
};

export function useChatScreenState({
  sessionId,
  initialApprovalPolicy,
  initialChats,
  activeChatId,
  initialShowWorkspaceHome = false,
}: UseChatScreenStateParams) {
  const [approvalPolicy, setApprovalPolicy] = useState<ApprovalPolicy | undefined>(initialApprovalPolicy);
  const [isPolicyChanging, setIsPolicyChanging] = useState(false);
  const [modelSettings, setModelSettings] = useState<ModelSettingsResponse | null>(null);
  const [isWorkspaceHome, setIsWorkspaceHome] = useState(initialShowWorkspaceHome);
  const [chats, setChats] = useState<SessionChat[]>(() => sortSessionChats(initialChats));
  const [selectedChatId, setSelectedChatId] = useState<string | null>(activeChatId);
  const [isNewChatPlaceholder, setIsNewChatPlaceholder] = useState(false);

  useEffect(() => {
    fetch('/api/settings/models')
      .then((response) => response.json())
      .then((data) => {
        if (!data.error) {
          setModelSettings(data);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setChats(sortSessionChats(initialChats));
  }, [initialChats]);

  useEffect(() => {
    setSelectedChatId(activeChatId);
  }, [sessionId, activeChatId]);

  const activeChat = useMemo(
    () => resolveActiveChat(chats, selectedChatId, isNewChatPlaceholder, isWorkspaceHome),
    [chats, isNewChatPlaceholder, selectedChatId, isWorkspaceHome],
  );
  const activeChatIdResolved = activeChat?.id ?? null;

  useEffect(() => {
    const nextSelectedChatId = resolveNextSelectedChatId({
      chats,
      selectedChatId,
      requestedChatId: readChatIdFromLocation(),
      isNewChatPlaceholder,
      isWorkspaceHome,
    });
    if (nextSelectedChatId === selectedChatId) {
      return;
    }
    setSelectedChatId(nextSelectedChatId);
  }, [chats, isNewChatPlaceholder, isWorkspaceHome, selectedChatId]);

  useEffect(() => {
    const syncFromHistory = () => {
      const requestedChatId = readChatIdFromLocation();
      if (requestedChatId) {
        setIsWorkspaceHome(false);
        setIsNewChatPlaceholder(false);
        setSelectedChatId(resolveNextSelectedChatId({
          chats,
          selectedChatId: null,
          requestedChatId,
          isNewChatPlaceholder: false,
        }));
        return;
      }
      setIsWorkspaceHome(true);
      setIsNewChatPlaceholder(false);
      setSelectedChatId(null);
    };

    window.addEventListener('popstate', syncFromHistory);
    return () => {
      window.removeEventListener('popstate', syncFromHistory);
    };
  }, [chats]);

  useEffect(() => {
    if (isWorkspaceHome || isNewChatPlaceholder || !activeChatIdResolved) {
      return;
    }
    writeChatIdToHistory(buildChatUrl(sessionId, activeChatIdResolved), 'replace');
  }, [activeChatIdResolved, isNewChatPlaceholder, isWorkspaceHome, sessionId]);

  const includeUnassignedEvents = Boolean(activeChat?.isDefault);

  return {
    activeChat,
    activeChatIdResolved,
    approvalPolicy,
    chats,
    includeUnassignedEvents,
    isNewChatPlaceholder,
    isPolicyChanging,
    isWorkspaceHome,
    modelSettings,
    selectedChatId,
    setApprovalPolicy,
    setChats,
    setIsNewChatPlaceholder,
    setIsPolicyChanging,
    setIsWorkspaceHome,
    setSelectedChatId,
  };
}
