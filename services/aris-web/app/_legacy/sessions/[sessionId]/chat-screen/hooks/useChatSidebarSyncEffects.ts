import { useEffect, useRef } from 'react';
import { SIDEBAR_STATUS_REFRESH_MS, SIDEBAR_VISIBLE_CHAT_LIMIT } from '../constants';
import {
  buildReadMarkerMap,
  buildSnapshotFromChat,
  buildSnapshotSyncMap,
  getLatestVisibleEvent,
  hasChatErrorSignal,
  isUserEvent,
  resolveRecentSummary,
  sortSessionChats,
} from '../helpers';
import { resolveChatReadMarkerId } from '../../chatSidebar';
import type { ChatApprovalFeedback, ChatSidebarSnapshot } from '../types';
import type { SessionChat, UiEvent } from '@/lib/happy/types';

type Params = {
  activeChatId: string | null;
  activeChatIdResolved: string | null;
  chatReadMarkers: Record<string, string>;
  chatSidebarSnapshots: Record<string, ChatSidebarSnapshot>;
  chats: SessionChat[];
  events: UiEvent[];
  eventsForChatId: string | null;
  initialChats: SessionChat[];
  isAborting: boolean;
  isAgentRunning: boolean;
  isAuxSyncReady: boolean;
  isAwaitingReply: boolean;
  isSessionSyncLeader: boolean;
  isSubmitting: boolean;
  renderedSidebarChats: SessionChat[];
  sessionId: string;
  setApprovalFeedbackByChat: React.Dispatch<React.SetStateAction<Record<string, ChatApprovalFeedback>>>;
  setChatReadMarkers: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  setChatSidebarSnapshots: React.Dispatch<React.SetStateAction<Record<string, ChatSidebarSnapshot>>>;
  setChats: React.Dispatch<React.SetStateAction<SessionChat[]>>;
  setSidebarApprovalLoadingChatId: (value: string | null) => void;
  upsertChatSidebarSnapshot: (chatId: string, patch: Partial<ChatSidebarSnapshot>) => void;
  visibleEvents: UiEvent[];
};

export function useChatSidebarSyncEffects({
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
}: Params) {
  const chatSidebarFetchInFlightRef = useRef<Record<string, boolean>>({});
  const readMarkerSyncInFlightRef = useRef<Record<string, boolean>>({});
  const readMarkerSyncedRef = useRef<Record<string, string>>(buildReadMarkerMap(initialChats));
  const snapshotSyncInFlightRef = useRef<Record<string, boolean>>({});
  const snapshotSyncedEventRef = useRef<Record<string, string>>(buildSnapshotSyncMap(initialChats));

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
  }, [activeChatId, initialChats, setChatReadMarkers]);

  useEffect(() => {
    setSidebarApprovalLoadingChatId(null);
  }, [activeChatIdResolved, setSidebarApprovalLoadingChatId]);

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
        if (chatIds.has(chatId)) {
          next[chatId] = state;
        }
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
  }, [chats, setApprovalFeedbackByChat, setChatReadMarkers, setChatSidebarSnapshots]);

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
  }, [activeChatIdResolved, chatSidebarSnapshots, eventsForChatId, setChatReadMarkers, visibleEvents]);

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
}
