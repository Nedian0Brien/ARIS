import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getLatestRunStatusSince,
  resolveChatRunPhase as resolveRunPhaseState,
} from '@/lib/happy/chatRuntime';
import type { RenderablePermissionRequest } from '@/lib/happy/permissions';
import type { PermissionRequest, SessionChat, UiEvent } from '@/lib/happy/types';
import {
  SIDEBAR_APPROVAL_FEEDBACK_MS,
  SIDEBAR_CHAT_PAGE_SIZE,
  SIDEBAR_STATUS_REFRESH_MS,
  SIDEBAR_VISIBLE_CHAT_LIMIT,
} from '../constants';
import {
  buildReadMarkerMap,
  buildSnapshotFromChat,
  buildSnapshotSyncMap,
  CHAT_SIDEBAR_SECTION_LABELS,
  DEFAULT_CHAT_RUNTIME_UI_STATE,
  getLatestVisibleEvent,
  hasChatErrorSignal,
  isUserEvent,
  resolveRecentSummary,
  sortSessionChats,
} from '../helpers';
import { resolveChatReadMarkerId } from '../../chatSidebar';
import type {
  ChatApprovalFeedback,
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
  const [approvalFeedbackByChat, setApprovalFeedbackByChat] = useState<Record<string, ChatApprovalFeedback>>({});
  const [sidebarApprovalLoadingChatId, setSidebarApprovalLoadingChatId] = useState<string | null>(null);
  const [chatVisibleCount, setChatVisibleCount] = useState(SIDEBAR_CHAT_PAGE_SIZE);
  const approvalFeedbackTimersRef = useRef<Record<string, number>>({});
  const chatSidebarFetchInFlightRef = useRef<Record<string, boolean>>({});
  const readMarkerSyncInFlightRef = useRef<Record<string, boolean>>({});
  const readMarkerSyncedRef = useRef<Record<string, string>>(buildReadMarkerMap(initialChats));
  const snapshotSyncInFlightRef = useRef<Record<string, boolean>>({});
  const snapshotSyncedEventRef = useRef<Record<string, string>>(buildSnapshotSyncMap(initialChats));

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
  const hasMoreChats = groupedSidebarChats.history.length > visibleHistoryChats.length;

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
  }, [decidePermission, isOperator, pendingPermissions, scheduleApprovalFeedbackReset, setChatMutationError]);

  useEffect(() => {
    const sortedInitialChats = sortSessionChats(initialChats);
    const persistedReadMarkers = buildReadMarkerMap(sortedInitialChats);
    setChatReadMarkers((prev) => {
      const merged = { ...persistedReadMarkers };
      for (const chat of sortedInitialChats) {
        const localMarker = prev[chat.id];
        if (localMarker) {
          merged[chat.id] = localMarker;
        }
      }
      return merged;
    });
    readMarkerSyncedRef.current = { ...persistedReadMarkers };
  }, [initialChats, activeChatId]);

  useEffect(() => {
    setSidebarApprovalLoadingChatId(null);
  }, [activeChatIdResolved]);

  useEffect(() => {
    setChatVisibleCount((prev) => {
      const nextMax = Math.max(SIDEBAR_CHAT_PAGE_SIZE, groupedSidebarChats.history.length);
      return Math.min(prev, nextMax);
    });
  }, [groupedSidebarChats.history.length]);

  useEffect(() => {
    return () => {
      for (const timerId of Object.values(approvalFeedbackTimersRef.current)) {
        window.clearTimeout(timerId);
      }
      approvalFeedbackTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    const chatIds = new Set(chats.map((chat) => chat.id));
    setChatSidebarSnapshots((prev) => {
      const nextEntries = Object.entries(prev).filter(([chatId]) => chatIds.has(chatId));
      if (nextEntries.length === Object.keys(prev).length) {
        return prev;
      }
      return Object.fromEntries(nextEntries);
    });
    setApprovalFeedbackByChat((prev) => {
      const next: Record<string, ChatApprovalFeedback> = {};
      for (const [chatId, state] of Object.entries(prev)) {
        if (!chatIds.has(chatId)) {
          const timerId = approvalFeedbackTimersRef.current[chatId];
          if (timerId) {
            window.clearTimeout(timerId);
            delete approvalFeedbackTimersRef.current[chatId];
          }
          continue;
        }
        next[chatId] = state;
      }
      if (Object.keys(next).length === Object.keys(prev).length) {
        return prev;
      }
      return next;
    });
    setChatReadMarkers((prev) => {
      const next: Record<string, string> = {};
      for (const [chatId, marker] of Object.entries(prev)) {
        if (chatIds.has(chatId)) {
          next[chatId] = marker;
        }
      }
      if (Object.keys(next).length === Object.keys(prev).length) {
        return prev;
      }
      return next;
    });

    const nextInFlight: Record<string, boolean> = {};
    for (const [chatId, value] of Object.entries(chatSidebarFetchInFlightRef.current)) {
      if (chatIds.has(chatId)) {
        nextInFlight[chatId] = value;
      }
    }
    chatSidebarFetchInFlightRef.current = nextInFlight;

    const nextReadSyncInFlight: Record<string, boolean> = {};
    for (const [chatId, value] of Object.entries(readMarkerSyncInFlightRef.current)) {
      if (chatIds.has(chatId)) {
        nextReadSyncInFlight[chatId] = value;
      }
    }
    readMarkerSyncInFlightRef.current = nextReadSyncInFlight;

    const nextReadSynced: Record<string, string> = {};
    for (const [chatId, marker] of Object.entries(readMarkerSyncedRef.current)) {
      if (chatIds.has(chatId)) {
        nextReadSynced[chatId] = marker;
      }
    }
    readMarkerSyncedRef.current = nextReadSynced;

    const nextSnapshotSyncInFlight: Record<string, boolean> = {};
    for (const [chatId, inFlight] of Object.entries(snapshotSyncInFlightRef.current)) {
      if (chatIds.has(chatId)) {
        nextSnapshotSyncInFlight[chatId] = inFlight;
      }
    }
    snapshotSyncInFlightRef.current = nextSnapshotSyncInFlight;

    const nextSnapshotSyncedEvent: Record<string, string> = {};
    for (const [chatId, eventId] of Object.entries(snapshotSyncedEventRef.current)) {
      if (chatIds.has(chatId)) {
        nextSnapshotSyncedEvent[chatId] = eventId;
      }
    }
    snapshotSyncedEventRef.current = nextSnapshotSyncedEvent;
  }, [chats]);

  useEffect(() => {
    for (const chat of chats) {
      const seeded = buildSnapshotFromChat(chat);
      if (!seeded) {
        continue;
      }
      const current = chatSidebarSnapshots[chat.id];
      const currentHasData = Boolean(current?.latestEventId) || Boolean(current?.preview?.trim());
      if (currentHasData) {
        continue;
      }
      upsertChatSidebarSnapshot(chat.id, seeded);
    }
  }, [chats, chatSidebarSnapshots, upsertChatSidebarSnapshot]);

  useEffect(() => {
    if (!isSessionSyncLeader || !activeChatIdResolved) {
      return;
    }
    if (eventsForChatId !== activeChatIdResolved) {
      return;
    }
    const latestVisibleEvent = getLatestVisibleEvent(visibleEvents);
    const latestEvent = events[events.length - 1];
    upsertChatSidebarSnapshot(activeChatIdResolved, {
      preview: latestVisibleEvent ? resolveRecentSummary(latestVisibleEvent) : '',
      hasEvents: visibleEvents.length > 0,
      hasErrorSignal: hasChatErrorSignal(latestEvent),
      latestEventId: latestVisibleEvent?.id ?? null,
      latestEventAt: latestVisibleEvent?.timestamp ?? null,
      latestEventIsUser: Boolean(latestVisibleEvent ? isUserEvent(latestVisibleEvent) : false),
      isRunning: isAgentRunning,
    });
  }, [
    activeChatIdResolved,
    events,
    eventsForChatId,
    isAgentRunning,
    isSessionSyncLeader,
    upsertChatSidebarSnapshot,
    visibleEvents,
  ]);

  useEffect(() => {
    if (!activeChatIdResolved) {
      return;
    }
    if (eventsForChatId !== activeChatIdResolved) {
      return;
    }
    const latestEvent = getLatestVisibleEvent(visibleEvents);
    const nextReadMarker = resolveChatReadMarkerId({
      latestEventId: latestEvent?.id,
      fallbackLatestEventId: chatSidebarSnapshots[activeChatIdResolved]?.latestEventId,
    });
    if (!nextReadMarker) {
      return;
    }
    setChatReadMarkers((prev) => (
      prev[activeChatIdResolved] === nextReadMarker
        ? prev
        : {
            ...prev,
            [activeChatIdResolved]: nextReadMarker,
          }
    ));
  }, [activeChatIdResolved, chatSidebarSnapshots, eventsForChatId, visibleEvents]);

  useEffect(() => {
    if (!activeChatIdResolved || !isSessionSyncLeader) {
      return;
    }
    const snapshot = chatSidebarSnapshots[activeChatIdResolved];
    const latestEventId = snapshot?.latestEventId?.trim() ?? '';
    if (!latestEventId) {
      return;
    }
    if (snapshotSyncedEventRef.current[activeChatIdResolved] === latestEventId) {
      return;
    }
    if (snapshotSyncInFlightRef.current[activeChatIdResolved]) {
      return;
    }

    const latestEventAt = snapshot.latestEventAt;
    const timer = window.setTimeout(() => {
      snapshotSyncInFlightRef.current[activeChatIdResolved] = true;
      void fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(activeChatIdResolved)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            latestPreview: snapshot.preview,
            latestEventId,
            latestEventAt,
            latestEventIsUser: snapshot.latestEventIsUser,
            latestHasErrorSignal: snapshot.hasErrorSignal,
          }),
        },
      )
        .then(async (response) => {
          if (!response.ok) {
            return;
          }
          snapshotSyncedEventRef.current[activeChatIdResolved] = latestEventId;
          const payload = (await response.json().catch(() => ({}))) as { chat?: SessionChat };
          if (!payload.chat) {
            return;
          }
          setChats((prev) => sortSessionChats(prev.map((chat) => (
            chat.id === payload.chat?.id ? payload.chat : chat
          ))));
        })
        .catch(() => {})
        .finally(() => {
          delete snapshotSyncInFlightRef.current[activeChatIdResolved];
        });
    }, 600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeChatIdResolved, chatSidebarSnapshots, isSessionSyncLeader, sessionId, setChats]);

  useEffect(() => {
    if (!isSessionSyncLeader) {
      return;
    }

    const pending = Object.entries(chatReadMarkers).filter(([chatId, marker]) => (
      marker
      && marker !== readMarkerSyncedRef.current[chatId]
      && !readMarkerSyncInFlightRef.current[chatId]
    ));
    if (pending.length === 0) {
      return;
    }
    let cancelled = false;

    for (const [chatId, marker] of pending) {
      readMarkerSyncInFlightRef.current[chatId] = true;
      const readAt = chatSidebarSnapshots[chatId]?.latestEventAt ?? new Date().toISOString();
      void fetch(
        `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(chatId)}`,
        {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lastReadEventId: marker,
            lastReadAt: readAt,
          }),
        },
      )
        .then((response) => {
          if (!response.ok || cancelled) {
            return;
          }
          readMarkerSyncedRef.current[chatId] = marker;
        })
        .catch(() => {})
        .finally(() => {
          delete readMarkerSyncInFlightRef.current[chatId];
        });
    }

    return () => {
      cancelled = true;
    };
  }, [chatReadMarkers, chatSidebarSnapshots, isSessionSyncLeader, sessionId]);

  useEffect(() => {
    if (!isSessionSyncLeader || (!isAuxSyncReady && !isAwaitingReply && !isSubmitting && !isAborting)) {
      return undefined;
    }

    let cancelled = false;
    const refreshVisibleChats = async () => {
      if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
        return;
      }

      const recentChats = renderedSidebarChats.slice(0, SIDEBAR_VISIBLE_CHAT_LIMIT);
      const activeChat = chats.find((chat) => chat.id === activeChatIdResolved);
      if (activeChat && !recentChats.some((chat) => chat.id === activeChat.id)) {
        recentChats.push(activeChat);
      }

      const targets = recentChats.filter((chat) => !chatSidebarFetchInFlightRef.current[chat.id]);
      if (targets.length === 0) {
        return;
      }

      for (const chat of targets) {
        chatSidebarFetchInFlightRef.current[chat.id] = true;
      }

      try {
        const params = new URLSearchParams();
        for (const chat of targets) {
          params.append('chatId', chat.id);
        }
        if (activeChatIdResolved) {
          params.set('activeChatId', activeChatIdResolved);
        }
        const response = await fetch(
          `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/sidebar?${params.toString()}`,
          { cache: 'no-store' },
        );
        if (!response.ok) {
          return;
        }
        const payload = (await response.json().catch(() => ({}))) as {
          snapshots?: Array<{
            chatId: string;
            preview: string;
            hasEvents: boolean;
            hasErrorSignal: boolean;
            latestEventId: string | null;
            latestEventAt: string | null;
            latestEventIsUser: boolean;
            isRunning: boolean;
          }>;
        };
        if (!Array.isArray(payload.snapshots) || cancelled) {
          return;
        }
        for (const snapshot of payload.snapshots) {
          if (!snapshot?.chatId) {
            continue;
          }
          upsertChatSidebarSnapshot(snapshot.chatId, {
            preview: snapshot.preview,
            hasEvents: snapshot.hasEvents,
            hasErrorSignal: snapshot.hasErrorSignal,
            latestEventId: snapshot.latestEventId,
            latestEventAt: snapshot.latestEventAt,
            latestEventIsUser: snapshot.latestEventIsUser,
            isRunning: snapshot.isRunning,
          });
        }
      } catch {
        // keep previous snapshot on transient failures
      } finally {
        for (const chat of targets) {
          delete chatSidebarFetchInFlightRef.current[chat.id];
        }
      }
    };

    void refreshVisibleChats();
    const intervalId = window.setInterval(() => {
      void refreshVisibleChats();
    }, SIDEBAR_STATUS_REFRESH_MS);
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    activeChatIdResolved,
    chats,
    isAborting,
    isAuxSyncReady,
    isAwaitingReply,
    isSessionSyncLeader,
    isSubmitting,
    renderedSidebarChats,
    sessionId,
    upsertChatSidebarSnapshot,
  ]);

  return {
    approvalFeedbackByChat,
    chatReadMarkers,
    chatSidebarSnapshots,
    chatVisibleCount,
    groupedSidebarChats,
    handleMarkChatAsRead,
    handleSidebarPermissionDecision,
    hasMoreChats,
    hasUnreadMessages,
    renderedSidebarChats,
    resolveChatPreviewText,
    resolveChatSidebarState,
    resolveSidebarChatRunPhase,
    setApprovalFeedbackByChat,
    setChatReadMarkers,
    setChatSidebarSnapshots,
    setChatVisibleCount,
    setSidebarApprovalLoadingChatId,
    sidebarApprovalLoadingChatId,
    sidebarSections,
    upsertChatSidebarSnapshot,
    visibleHistoryChats,
  };
}
