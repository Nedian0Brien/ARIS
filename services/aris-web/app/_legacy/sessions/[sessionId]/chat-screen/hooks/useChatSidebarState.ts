import { useCallback, useMemo, useState, type RefObject } from 'react';
import {
  getLatestRunStatusSince,
  resolveChatRunPhase as resolveRunPhaseState,
} from '@/lib/happy/chatRuntime';
import type { RenderablePermissionRequest } from '@/lib/happy/permissions';
import type { PermissionRequest, SessionChat, UiEvent } from '@/lib/happy/types';
import { CHAT_SIDEBAR_SECTION_LABELS, DEFAULT_CHAT_RUNTIME_UI_STATE } from '../constants';
import {
  buildReadMarkerMap,
  buildSnapshotFromChat,
  getLatestVisibleEvent,
  hasChatErrorSignal,
  isUserEvent,
  resolveRecentSummary,
  sortSessionChats,
} from '../helpers';
import { resolveChatReadMarkerId } from '../../chatSidebar';
import { useChatSidebarApprovalState } from './useChatSidebarApprovalState';
import { useChatSidebarPagination } from './useChatSidebarPagination';
import { useChatSidebarSyncEffects } from './useChatSidebarSyncEffects';
import type {
  ChatRunPhase,
  ChatRuntimeUiState,
  ChatSidebarSection,
  ChatSidebarSectionKey,
  ChatSidebarSnapshot,
  ChatSidebarState,
} from '../types';

type UseChatSidebarStateParams = {
  activeChatIdResolved: string | null;
  chats: SessionChat[];
  events: UiEvent[];
  eventsForChatId: string | null;
  initialChats: SessionChat[];
  initialEvents: UiEvent[];
  activeChatId: string | null;
  visibleEvents: UiEvent[];
  isAgentRunning: boolean;
  isSessionSyncLeader: boolean;
  sessionId: string;
  runtimeRunning: boolean;
  chatRuntimeUiByChat: Record<string, ChatRuntimeUiState>;
  effectivePendingPermissions: RenderablePermissionRequest[];
  submitError: string | null;
  syncError: string | null;
  runtimeError: string | null;
  showDisconnectRetry: boolean;
  pendingPermissions: PermissionRequest[];
  decidePermission: (permissionId: string, decision: 'allow_once' | 'allow_session' | 'deny') => Promise<{ success: boolean; error?: string | null }>;
  isOperator: boolean;
  setChatMutationError: (value: string | null) => void;
  isAuxSyncReady: boolean;
  isAwaitingReply: boolean;
  isSubmitting: boolean;
  isAborting: boolean;
  chatListRef: RefObject<HTMLDivElement | null>;
  chatListSentinelRef: RefObject<HTMLDivElement | null>;
  isChatSidebarOpen: boolean;
  setChats: React.Dispatch<React.SetStateAction<SessionChat[]>>;
};

export function useChatSidebarState({
  activeChatIdResolved,
  activeChatId,
  chatRuntimeUiByChat,
  chats,
  decidePermission,
  effectivePendingPermissions,
  events,
  eventsForChatId,
  initialChats,
  initialEvents,
  isAborting,
  isAgentRunning,
  isAuxSyncReady,
  isAwaitingReply,
  isChatSidebarOpen,
  isOperator,
  isSessionSyncLeader,
  isSubmitting,
  pendingPermissions,
  runtimeError,
  runtimeRunning,
  sessionId,
  setChatMutationError,
  setChats,
  showDisconnectRetry,
  submitError,
  syncError,
  visibleEvents,
  chatListRef,
  chatListSentinelRef,
}: UseChatSidebarStateParams) {
  const [chatSidebarSnapshots, setChatSidebarSnapshots] = useState<Record<string, ChatSidebarSnapshot>>(() => {
    const sortedInitialChats = sortSessionChats(initialChats);
    const seeded: Record<string, ChatSidebarSnapshot> = {};
    for (const chat of sortedInitialChats) {
      const snapshot = buildSnapshotFromChat(chat);
      if (snapshot) {
        seeded[chat.id] = snapshot;
      }
    }
    const initialActiveChatId = (activeChatId && activeChatId.trim().length > 0
      ? activeChatId.trim()
      : sortedInitialChats[0]?.id) ?? null;
    if (!initialActiveChatId) {
      return seeded;
    }
    const latestInitialEvent = getLatestVisibleEvent(initialEvents);
    if (!latestInitialEvent) {
      return seeded;
    }
    return {
      ...seeded,
      [initialActiveChatId]: {
        preview: resolveRecentSummary(latestInitialEvent),
        hasEvents: true,
        hasErrorSignal: hasChatErrorSignal(latestInitialEvent),
        latestEventId: latestInitialEvent.id,
        latestEventAt: latestInitialEvent.timestamp,
        latestEventIsUser: isUserEvent(latestInitialEvent),
        isRunning: false,
      },
    };
  });
  const [chatReadMarkers, setChatReadMarkers] = useState<Record<string, string>>(() => buildReadMarkerMap(initialChats));
  const {
    approvalFeedbackByChat,
    handleSidebarPermissionDecision,
    setApprovalFeedbackByChat,
    setSidebarApprovalLoadingChatId,
    sidebarApprovalLoadingChatId,
  } = useChatSidebarApprovalState({
    decidePermission,
    isOperator,
    pendingPermissions,
    setChatMutationError,
  });

  const latestRunStatus = useMemo(
    () => getLatestRunStatusSince(events, null),
    [events],
  );

  const upsertChatSidebarSnapshot = useCallback((chatId: string, patch: Partial<ChatSidebarSnapshot>) => {
    setChatSidebarSnapshots((prev) => {
      const current = prev[chatId] ?? {
        preview: '',
        hasEvents: false,
        hasErrorSignal: false,
        latestEventId: null,
        latestEventAt: null,
        latestEventIsUser: false,
        isRunning: false,
      };
      const next: ChatSidebarSnapshot = {
        ...current,
        ...patch,
      };
      if (
        current.preview === next.preview
        && current.hasEvents === next.hasEvents
        && current.hasErrorSignal === next.hasErrorSignal
        && current.latestEventId === next.latestEventId
        && current.latestEventAt === next.latestEventAt
        && current.latestEventIsUser === next.latestEventIsUser
        && current.isRunning === next.isRunning
      ) {
        return prev;
      }
      return {
        ...prev,
        [chatId]: next,
      };
    });
  }, []);

  const handleMarkChatAsRead = useCallback((chat: SessionChat) => {
    const nextReadMarker = resolveChatReadMarkerId({
      latestEventId: chatSidebarSnapshots[chat.id]?.latestEventId,
      fallbackLatestEventId: chat.latestEventId,
    });
    if (!nextReadMarker) {
      return;
    }

    setChatReadMarkers((prev) => (
      prev[chat.id] === nextReadMarker
        ? prev
        : {
            ...prev,
            [chat.id]: nextReadMarker,
          }
    ));
  }, [chatSidebarSnapshots]);

  const hasUnreadMessages = useCallback((chatId: string): boolean => {
    const snapshot = chatSidebarSnapshots[chatId];
    if (!snapshot?.latestEventId) {
      return false;
    }
    const readMarker = chatReadMarkers[chatId];
    if (!readMarker) {
      return false;
    }
    return readMarker !== snapshot.latestEventId;
  }, [chatReadMarkers, chatSidebarSnapshots]);

  const resolveSidebarChatRunPhase = useCallback((chat: SessionChat): ChatRunPhase => {
    const runtimeUi = chatRuntimeUiByChat[chat.id] ?? DEFAULT_CHAT_RUNTIME_UI_STATE;
    const snapshot = chatSidebarSnapshots[chat.id];
    const isActive = chat.id === activeChatIdResolved;

    return resolveRunPhaseState({
      isAborting: runtimeUi.isAborting,
      isSubmitting: runtimeUi.isSubmitting,
      hasCompletionSignal: runtimeUi.hasCompletionSignal,
      runtimeRunning: (isActive && runtimeRunning) || Boolean(snapshot?.isRunning),
      isAwaitingReply: runtimeUi.isAwaitingReply,
      runStatus: isActive ? latestRunStatus : null,
      hasPendingPermission: isActive && effectivePendingPermissions.length > 0,
    });
  }, [
    activeChatIdResolved,
    chatRuntimeUiByChat,
    chatSidebarSnapshots,
    effectivePendingPermissions.length,
    latestRunStatus,
    runtimeRunning,
  ]);

  const resolveChatSidebarState = useCallback((chat: SessionChat): ChatSidebarState => {
    const isActive = chat.id === activeChatIdResolved;
    const snapshot = chatSidebarSnapshots[chat.id];
    const chatRunPhase = resolveSidebarChatRunPhase(chat);
    const hasFeedback = Boolean(approvalFeedbackByChat[chat.id]);
    const hasPendingApproval = isActive && effectivePendingPermissions.length > 0;
    const hasUnread = hasUnreadMessages(chat.id);
    const isRunningState = chatRunPhase !== 'idle';
    const hasErrorState = isActive
      ? (
          Boolean(submitError)
          || Boolean(syncError)
          || Boolean(runtimeError)
          || showDisconnectRetry
          || Boolean(snapshot?.hasErrorSignal)
        )
      : Boolean(snapshot?.hasErrorSignal);

    if (hasPendingApproval && !hasFeedback) {
      return 'approval';
    }
    if (hasErrorState) {
      return 'error';
    }
    if (isRunningState || hasFeedback) {
      return 'running';
    }
    if (!isActive && hasUnread && snapshot?.hasEvents && !snapshot.latestEventIsUser) {
      return 'completed';
    }
    return 'default';
  }, [
    activeChatIdResolved,
    approvalFeedbackByChat,
    chatSidebarSnapshots,
    effectivePendingPermissions.length,
    hasUnreadMessages,
    resolveSidebarChatRunPhase,
    runtimeError,
    showDisconnectRetry,
    submitError,
    syncError,
  ]);

  const resolveChatPreviewText = useCallback((chatId: string): string => {
    const snapshot = chatSidebarSnapshots[chatId];
    if (!snapshot) {
      const chat = chats.find((item) => item.id === chatId);
      const cached = typeof chat?.latestPreview === 'string' ? chat.latestPreview.trim() : '';
      if (cached) {
        return cached;
      }
      return '메시지 불러오는 중...';
    }
    const preview = snapshot.preview?.trim();
    if (preview) {
      return preview;
    }
    if (snapshot.hasEvents) {
      return '메시지 불러오는 중...';
    }
    return '최근 메시지가 없습니다.';
  }, [chatSidebarSnapshots, chats]);

  const resolveChatSidebarSection = useCallback((chat: SessionChat): ChatSidebarSectionKey => {
    if (chat.isPinned) {
      return 'pinned';
    }
    const sidebarState = resolveChatSidebarState(chat);
    if (sidebarState === 'running' || sidebarState === 'approval') {
      return 'running';
    }
    if (sidebarState === 'completed') {
      return 'completed';
    }
    return 'history';
  }, [resolveChatSidebarState]);

  const groupedSidebarChats = useMemo<Record<ChatSidebarSectionKey, SessionChat[]>>(() => {
    const grouped: Record<ChatSidebarSectionKey, SessionChat[]> = {
      pinned: [],
      running: [],
      completed: [],
      history: [],
    };
    for (const chat of chats) {
      grouped[resolveChatSidebarSection(chat)].push(chat);
    }
    return grouped;
  }, [chats, resolveChatSidebarSection]);
  const {
    chatVisibleCount,
    hasMoreChats,
  } = useChatSidebarPagination({
    chatHistoryCount: groupedSidebarChats.history.length,
    chatListRef,
    chatListSentinelRef,
    isChatSidebarOpen,
  });

  const visibleHistoryChats = useMemo(() => {
    const visibleIds = new Set(groupedSidebarChats.history.slice(0, chatVisibleCount).map((chat) => chat.id));
    if (activeChatIdResolved) {
      visibleIds.add(activeChatIdResolved);
    }
    return groupedSidebarChats.history.filter((chat) => visibleIds.has(chat.id));
  }, [activeChatIdResolved, chatVisibleCount, groupedSidebarChats.history]);

  const sidebarSections = useMemo<ChatSidebarSection[]>(() => {
    const sections: ChatSidebarSection[] = [
      {
        key: 'pinned',
        label: CHAT_SIDEBAR_SECTION_LABELS.pinned,
        chats: groupedSidebarChats.pinned,
        totalCount: groupedSidebarChats.pinned.length,
      },
      {
        key: 'running',
        label: CHAT_SIDEBAR_SECTION_LABELS.running,
        chats: groupedSidebarChats.running,
        totalCount: groupedSidebarChats.running.length,
      },
      {
        key: 'completed',
        label: CHAT_SIDEBAR_SECTION_LABELS.completed,
        chats: groupedSidebarChats.completed,
        totalCount: groupedSidebarChats.completed.length,
      },
      {
        key: 'history',
        label: CHAT_SIDEBAR_SECTION_LABELS.history,
        chats: visibleHistoryChats,
        totalCount: groupedSidebarChats.history.length,
      },
    ];
    return sections.filter((section) => section.totalCount > 0);
  }, [groupedSidebarChats, visibleHistoryChats]);

  const renderedSidebarChats = useMemo(
    () => [
      ...groupedSidebarChats.pinned,
      ...groupedSidebarChats.running,
      ...groupedSidebarChats.completed,
      ...visibleHistoryChats,
    ],
    [groupedSidebarChats, visibleHistoryChats],
  );

  useChatSidebarSyncEffects({
    activeChatId,
    activeChatIdResolved,
    chatReadMarkers,
    chatSidebarSnapshots,
    chats,
    events,
    eventsForChatId,
    initialChats,
    isAborting,
    isAgentRunning,
    isAuxSyncReady,
    isAwaitingReply,
    isSessionSyncLeader,
    isSubmitting,
    renderedSidebarChats,
    sessionId,
    setApprovalFeedbackByChat,
    setChatReadMarkers,
    setChatSidebarSnapshots,
    setChats,
    setSidebarApprovalLoadingChatId,
    upsertChatSidebarSnapshot,
    visibleEvents,
  });

  return {
    approvalFeedbackByChat,
    chatSidebarSnapshots,
    handleMarkChatAsRead,
    handleSidebarPermissionDecision,
    hasMoreChats,
    hasUnreadMessages,
    resolveChatPreviewText,
    resolveChatSidebarState,
    resolveSidebarChatRunPhase,
    sidebarApprovalLoadingChatId,
    sidebarSections,
  };
}
