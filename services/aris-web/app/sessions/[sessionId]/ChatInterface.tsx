'use client';

import { useCallback, useDeferredValue, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { CSSProperties, ChangeEvent } from 'react';
import { useSessionEvents } from '@/lib/hooks/useSessionEvents';
import { usePermissions } from '@/lib/hooks/usePermissions';
import { useSessionRuntime } from '@/lib/hooks/useSessionRuntime';
import { useSessionSyncLeader } from '@/lib/hooks/useSessionSyncLeader';
import {
  getLatestAgentEventTimestampSince,
  getLatestCompletionSignalTimestampSince,
  getLatestRunStatusSince,
  isCompletionSignalStillTerminal,
  isRunLifecycleEvent,
  resolveChatRunPhase as resolveRunPhaseState,
} from '@/lib/happy/chatRuntime';
import { hydratePersistedPermissions, mergeRenderablePermissions } from '@/lib/happy/permissions';
import { stripImageAttachmentPromptPrefix } from '@/lib/chatImageAttachments';
import { resolveAvailableChatCommands, type ChatCommandId } from './chatCommands';
import { createPortal } from 'react-dom';
import type { ApprovalPolicy, ChatImageAttachment, PermissionRequest, SessionChat, UiEvent } from '@/lib/happy/types';
import { UsageProbeModal } from './UsageProbeModal';
import { buildPermissionTimelineItems } from './chatTimeline';
import { shouldShowDebugToggleInHeader } from './chatDebugMode';
import { deriveWorkspaceTitle } from './workspaceHome';
import { buildWorkspacePagerItems, moveWorkspacePager } from './workspace-panels/pagerModel';
import { useWorkspacePanels } from './workspace-panels/useWorkspacePanels';
import { useChatRunActions } from './chat-screen/actions/useChatRunActions';
import { useChatSessionActions } from './chat-screen/actions/useChatSessionActions';
import { ChatCenterPane } from './chat-screen/center-pane/ChatCenterPane';
import { ChatComposer } from './chat-screen/center-pane/ChatComposer';
import { ChatHeader } from './chat-screen/center-pane/ChatHeader';
import { LastUserMessageJumpBar } from './chat-screen/center-pane/LastUserMessageJumpBar';
import { ChatStatusNotices } from './chat-screen/center-pane/ChatStatusNotices';
import { ChatTimeline } from './chat-screen/center-pane/ChatTimeline';
import { FileBrowserModal } from './chat-screen/center-pane/FileBrowserModal';
import { NewChatPlaceholderPane } from './chat-screen/center-pane/NewChatPlaceholderPane';
import { WorkspaceHomePane } from './chat-screen/center-pane/WorkspaceHomePane';
import { WorkspacePagerShell } from './chat-screen/center-pane/WorkspacePagerShell';
import {
  resolveLastPassedUserMessageJumpTarget,
  resolveUserMessageJumpTargets,
  shouldShowLastUserMessageJumpBar,
  type LastUserMessageJumpTarget,
} from './chat-screen/center-pane/lastUserMessageBar';
import { useChatComposerInteractions } from './chat-screen/hooks/useChatComposerInteractions';
import { useChatCenterNavigationActions } from './chat-screen/hooks/useChatCenterNavigationActions';
import { useChatLayoutState } from './chat-screen/hooks/useChatLayoutState';
import { useChatHeaderStatusControls } from './chat-screen/hooks/useChatHeaderStatusControls';
import { useChatRuntimeUi } from './chat-screen/hooks/useChatRuntimeUi';
import { useChatScreenState } from './chat-screen/hooks/useChatScreenState';
import { useChatSidebarState } from './chat-screen/hooks/useChatSidebarState';
import { useComposerState } from './chat-screen/hooks/useComposerState';
import { useWorkspaceBrowserState } from './chat-screen/hooks/useWorkspaceBrowserState';
import { ChatSidebarPane } from './chat-screen/left-sidebar/ChatSidebarPane';
import { useChatSidebarSectionViews } from './chat-screen/left-sidebar/useChatSidebarSectionViews';
import { WorkspacePanelsPane } from './chat-screen/right-pane/WorkspacePanelsPane';
import styles from './ChatInterface.module.css';
import { shouldShowChatTransitionLoading } from './chatSelection';
import {
  haveComposerDockMetricsChanged,
  hasResumePhaseSettled,
  hasTailRestoreRenderHydrated,
  isNearBottom,
  resolvePrependedAnchorScrollTop,
  resolveTailRestoreLayoutReady,
  resolveMobileBottomLockState,
  type ComposerDockMetrics,
  type SessionScrollPhase,
  shouldAutoScrollToBottom,
  shouldAllowSystemScrollWrite,
  shouldBlockLoadOlder,
  shouldRecoverDetachedTailOnScroll,
  shouldUseManualScrollRestoration,
  shouldResetScrollForChatChange,
} from './chatScroll';
import { useChatTailRestore } from './useChatTailRestore';
import {
  activateSessionScrollOrchestrator,
  deactivateSessionScrollOrchestrator,
  dispatchSessionScrollPhaseEvent,
  useSessionScrollOrchestrator,
} from './useSessionScrollOrchestrator';
import { recordScrollDebugEvent } from './scrollDebug';
import {
  AGENT_ACTIVITY_SETTLE_MS,
  AGENT_REPLY_TIMEOUT_MS,
  CHAT_RUN_PHASE_LABELS,
  COMPOSER_MAX_HEIGHT_PX,
  COMPOSER_MIN_HEIGHT_PX,
  READ_CURSOR_SYNC_DEBOUNCE_MS,
  RUNTIME_DISCONNECT_GRACE_MS,
  WORKSPACE_FILE_OPEN_EVENT,
} from './chat-screen/constants';
import {
  buildProgressLabel,
  buildStreamRenderItems,
  copyTextToClipboard,
  deriveGeminiModeLabel,
  extractProgressMeta,
  formatElapsedDuration,
  formatRelative,
  genId,
  getLatestVisibleEvent,
  getRecentFiles,
  isPersistedPermissionEvent,
  isUserEvent,
  isWorkspacePathWithinRoot,
  joinWorkspacePath,
  normalizeAgentFlavor,
  normalizeGeminiModeId,
  normalizeModelId,
  normalizeWorkspaceClientPath,
  resolveAgentMeta,
  resolveComposerModels,
  resolveDefaultGeminiModeId,
  resolveDefaultModelId,
  resolveGeminiModeOptions,
  saveRecentFile,
  sortSessionChats,
} from './chat-screen/helpers';
import type {
  AgentMeta,
  ChatRunPhase,
  ContextItem,
  TimelineRenderItem,
  WorkspaceFileOpenDetail,
} from './chat-screen/types';

type OlderLoadAnchorSnapshot = {
  chatId: string | null;
  element: HTMLElement;
  topOffset: number;
};

// --- 1. 런타임 초기화 안전 장치 (TDZ 에러 방지를 위해 파일 상단에 유지) ---
// styles 객체 및 복잡한 객체 참조를 함수 호출 시점으로 지연시킴

function getAgentAvatarToneClass(tone: AgentMeta['tone']): string {
  const map: Record<AgentMeta['tone'], string> = {
    clay: styles.agentAvatarClay,
    mint: styles.agentAvatarMint,
    blue: styles.agentAvatarBlue,
  };
  return map[tone] || '';
}

// --- 2. Hydration 안전 컴포넌트 ---

function RelativeTime({ timestamp, className }: { timestamp: string; className?: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    const date = new Date(timestamp);
    return <span className={className}>{Number.isNaN(date.getTime()) ? '' : date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>;
  }

  return <span className={className}>{formatRelative(timestamp)}</span>;
}

function ElapsedTimer({ since, className }: { since: string; className?: string }) {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timerId = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);
    return () => {
      window.clearInterval(timerId);
    };
  }, []);

  return <span className={className}>{formatElapsedDuration(since, now)}</span>;
}

const RESUME_SCROLL_SETTLE_TIMEOUT_MS = 240;
const SYSTEM_SCROLL_AUTOSCROLL_COOLDOWN_MS = 900;

export function ChatInterface({
  sessionId,
  initialEvents,
  initialHasMoreBefore,
  initialPermissions,
  initialChats,
  activeChatId,
  isOperator,
  projectName,
  workspaceRootPath,
  agentFlavor,
  sessionModel,
  approvalPolicy: initialApprovalPolicy,
  initialShowWorkspaceHome = false,
  initialShowChatEntryLoading = false,
}: {
  sessionId: string;
  initialEvents: UiEvent[];
  initialHasMoreBefore: boolean;
  initialPermissions: PermissionRequest[];
  initialChats: SessionChat[];
  activeChatId: string | null;
  isOperator: boolean;
  projectName: string;
  workspaceRootPath: string;
  agentFlavor: string;
  sessionModel?: string | null;
  approvalPolicy?: ApprovalPolicy;
  initialShowWorkspaceHome?: boolean;
  initialShowChatEntryLoading?: boolean;
}) {
  const router = useRouter();
  const centerHeaderRef = useRef<HTMLElement>(null);
  const {
    activeChat,
    activeChatIdResolved,
    approvalPolicy,
    chats,
    includeUnassignedEvents,
    isNewChatPlaceholder,
    isPolicyChanging,
    isWorkspaceHome,
    modelSettings,
    setApprovalPolicy,
    setChats,
    setIsNewChatPlaceholder,
    setIsPolicyChanging,
    setIsWorkspaceHome,
    setSelectedChatId,
  } = useChatScreenState({
    sessionId,
    initialApprovalPolicy,
    initialChats,
    activeChatId,
    initialShowWorkspaceHome,
  });
  const { isLeader: isSessionSyncLeader } = useSessionSyncLeader(sessionId);
  const {
    activeChatRuntimeUi,
    chatRuntimeUiByChat,
    isAuxSyncReady,
    setAwaitingReplySince,
    setIsAwaitingReply,
    setShowDisconnectRetry,
    setSubmitError,
    updateActiveChatRuntimeUi,
    updateChatRuntimeUi,
  } = useChatRuntimeUi({
    sessionId,
    activeChatIdResolved,
  });
  const isSubmitting = activeChatRuntimeUi.isSubmitting;
  const isAwaitingReply = activeChatRuntimeUi.isAwaitingReply;
  const isAborting = activeChatRuntimeUi.isAborting;
  const hasCompletionSignal = activeChatRuntimeUi.hasCompletionSignal;
  const awaitingReplySince = activeChatRuntimeUi.awaitingReplySince;
  const showDisconnectRetry = activeChatRuntimeUi.showDisconnectRetry;
  const lastSubmittedPayload = activeChatRuntimeUi.lastSubmittedPayload;
  const submitError = activeChatRuntimeUi.submitError;
  const defaultAgentFlavor = normalizeAgentFlavor(agentFlavor, 'codex');
  const providerSelections = modelSettings?.providers;
  const legacyCustomModels = modelSettings?.legacyCustomModels;
  const activeAgentFlavor = normalizeAgentFlavor(activeChat?.agent, defaultAgentFlavor);
  const {
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
  } = useComposerState({
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
  });
  const {
    centerHeaderWidth,
    chatIdCopyState,
    expandedActionRunIds,
    expandedResultIds,
    highlightedEventId,
    idBundleCopyState,
    isChatSidebarOpen,
    isContextMenuOpen,
    isDebugMode,
    isMobileLayout,
    isMobileLayoutHydrated,
    isMounted,
    isViewportLayoutReady,
    setChatIdCopyState,
    setExpandedActionRunIds,
    setExpandedResultIds,
    setHighlightedEventId,
    setIdBundleCopyState,
    setIsChatSidebarOpen,
    setIsContextMenuOpen,
    setShowPermissionQueue,
    showPermissionQueue,
    toggleDebugMode,
  } = useChatLayoutState({
    centerHeaderRef,
  });
  const chatActionMenuRef = useRef<HTMLDivElement>(null);
  const [pendingUserEventsByChat, setPendingUserEventsByChat] = useState<Record<string, UiEvent[]>>({});
  const handleCopyUserMessage = useCallback(async (event: UiEvent) => {
    const text = stripImageAttachmentPromptPrefix((event.body || event.title || '').replace(/\r\n/g, '\n')).trim();
    if (!text) {
      return;
    }

    try {
      await copyTextToClipboard(text);
      setCopiedUserEventId(event.id);
    } catch {
      setCopiedUserEventId(null);
    }
  }, [setCopiedUserEventId]);
  const {
    fileBrowserError,
    fileBrowserItems,
    fileBrowserLoading,
    fileBrowserParentPath,
    fileBrowserPath,
    fileBrowserQuery,
    fileBrowserSearchLoading,
    fileBrowserSearchResults,
    normalizedWorkspaceRootPath,
    recentAttachments,
    setFileBrowserError,
    setFileBrowserItems,
    setFileBrowserLoading,
    setFileBrowserParentPath,
    setFileBrowserPath,
    setFileBrowserQuery,
    setFileBrowserSearchLoading,
    setFileBrowserSearchResults,
    setRecentAttachments,
    setSidebarFileRequest,
    sidebarFileRequest,
  } = useWorkspaceBrowserState({
    workspaceRootPath,
  });
  const {
    layout: workspacePanelLayout,
    activePageId: activeWorkspacePageId,
    setActivePageId: setActiveWorkspacePageId,
    loading: workspacePanelsLoading,
    error: workspacePanelsError,
    createPanel: createWorkspacePanel,
    savePanel: saveWorkspacePanel,
    deletePanel: deleteWorkspacePanel,
  } = useWorkspacePanels(sessionId);
  const workspacePagerItems = useMemo(
    () => buildWorkspacePagerItems(workspacePanelLayout),
    [workspacePanelLayout],
  );
  const explorerWorkspacePanel = useMemo(
    () => workspacePanelLayout.panels.find((panel) => panel.type === 'explorer') ?? null,
    [workspacePanelLayout.panels],
  );
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const chatShellRef = useRef<HTMLDivElement>(null);
  const chatSidebarRef = useRef<HTMLDivElement>(null);
  const chatListRef = useRef<HTMLDivElement>(null);
  const chatListSentinelRef = useRef<HTMLDivElement>(null);
  const centerPanelRef = useRef<HTMLElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const composerDockRef = useRef<HTMLElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const composerImageInputRef = useRef<HTMLInputElement>(null);
  const composerDockMetricsRef = useRef<ComposerDockMetrics | null>(null);
  const composerDockLayoutReadyTimeoutRef = useRef(0);
  const contextItemsRef = useRef<ContextItem[]>([]);
  const isSubmittingRef = useRef(false);
  const plusMenuRef = useRef<HTMLDivElement>(null);
  const modelDropdownRef = useRef<HTMLDivElement>(null);
  const geminiModeDropdownRef = useRef<HTMLDivElement>(null);
  const commandMenuRef = useRef<HTMLDivElement>(null);
  const pendingOlderLoadAnchorRef = useRef<OlderLoadAnchorSnapshot | null>(null);
  const previousActiveChatIdRef = useRef<string | null>(activeChatIdResolved);
  const previousTailLayoutSettlingRef = useRef(false);
  const genericAutoScrollCooldownUntilRef = useRef(0);
  const latestVisibleEventIdRef = useRef<string | null>(null);
  const disconnectNoticeAwaitingRef = useRef<string | null>(null);
  const runtimeStartedSinceAwaitingRef = useRef(false);
  const sidebarFileRequestNonceRef = useRef(0);
  const userMessageBubbleNodesRef = useRef(new Map<string, HTMLDivElement>());
  const [isComposerDockLayoutReady, setIsComposerDockLayoutReady] = useState(false);
  const [lastUserMessageJumpTarget, setLastUserMessageJumpTarget] = useState<LastUserMessageJumpTarget | null>(null);
  const handleDeleteEmptyAutoChat = useCallback(() => {
    if (!activeChat) {
      return;
    }

    const chatId = activeChat.id;
    void fetch(
      `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(chatId)}`,
      { method: 'DELETE' },
    ).then((r) => r.json()).then((body: { chats?: SessionChat[] }) => {
      if (Array.isArray(body.chats)) {
        setChats(sortSessionChats(body.chats));
      } else {
        setChats((prev) => prev.filter((c) => c.id !== chatId));
      }
    }).catch(() => {
      setChats((prev) => prev.filter((c) => c.id !== chatId));
    });
    setSelectedChatId(null);
    setIsWorkspaceHome(true);
  }, [activeChat, sessionId, setChats, setIsWorkspaceHome, setSelectedChatId]);
  const handleSelectQuickStart = useCallback((value: string) => {
    setPrompt(value);
    setTimeout(() => composerInputRef.current?.focus(), 0);
  }, [setPrompt]);
  const isLeftSidebarOverlayLayout = isMobileLayout;
  useEffect(() => {
    contextItemsRef.current = contextItems;
  }, [contextItems]);
  useEffect(() => {
    isSubmittingRef.current = isSubmitting;
  }, [isSubmitting]);
  const sessionTitle = deriveWorkspaceTitle(projectName);
  const currentChatTitle = activeChat?.title || '새 채팅';
  const displayName = activeChat?.title || sessionTitle;
  const {
    events,
    eventsForChatId,
    addEvent,
    syncError,
    loadOlder,
    hasMoreBefore,
    hasDetachedTail,
    isLoadingOlder,
    hasLoadedCurrentChat,
    resetToLatestWindow,
  } = useSessionEvents(
    sessionId,
    activeChatIdResolved,
    includeUnassignedEvents,
    initialEvents,
    initialHasMoreBefore,
    activeChatId,
    isSessionSyncLeader,
    initialShowChatEntryLoading,
  );
  const { isRunning: runtimeRunning, runtimeError } = useSessionRuntime(
    sessionId,
    activeChatIdResolved,
    isSessionSyncLeader && (
      isAuxSyncReady
      || activeChatRuntimeUi.isAwaitingReply
      || activeChatRuntimeUi.isSubmitting
      || activeChatRuntimeUi.isAborting
    ),
  );
  const {
    displayPermissions,
    pendingPermissions,
    loadingPermissionId,
    decidePermission,
    error: permissionError,
  } = usePermissions(
    sessionId,
    initialPermissions,
    activeChatIdResolved,
    includeUnassignedEvents,
    isSessionSyncLeader && (isAuxSyncReady || initialPermissions.length > 0),
  );
  const activeGeminiModeOptions = useMemo(
    () => resolveGeminiModeOptions(approvalPolicy),
    [approvalPolicy],
  );
  const activeComposerModels = useMemo(
    () => resolveComposerModels(activeAgentFlavor, providerSelections, legacyCustomModels),
    [activeAgentFlavor, legacyCustomModels, providerSelections],
  );
  const activeModelId = normalizeModelId(selectedModelId)
    ?? resolveDefaultModelId(activeAgentFlavor, providerSelections, legacyCustomModels, lastSelectedCodexModelId);
  const activeGeminiModeId = normalizeGeminiModeId(selectedGeminiModeId)
    ?? resolveDefaultGeminiModeId(approvalPolicy, providerSelections?.gemini?.defaultModeId);
  const {
    chatActionMenuId,
    chatActionMenuRect,
    chatMutationError,
    chatMutationLoadingId,
    chatTitleDraft,
    closeSidebarMenu,
    goToChat,
    handleCreateChat,
    handleDeleteChat,
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
  } = useChatSessionActions({
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
  });
  const codexReasoningEffort = activeAgentFlavor === 'codex'
    ? selectedModelReasoningEffort
    : undefined;
  const availableChatCommands = useMemo(
    () => resolveAvailableChatCommands(activeAgentFlavor),
    [activeAgentFlavor],
  );
  const activeGeminiMode = activeGeminiModeOptions.find((mode) => mode.id === activeGeminiModeId)
    ?? { id: activeGeminiModeId, shortLabel: deriveGeminiModeLabel(activeGeminiModeId), badge: '현재' };
  const agentMeta = resolveAgentMeta(activeAgentFlavor);
  const showDebugToggleInHeader = shouldShowDebugToggleInHeader(centerHeaderWidth, isMobileLayout);
  const runtimeNotice = submitError ?? permissionError ?? syncError ?? runtimeError ?? null;
  const latestRunStatus = useMemo(
    () => getLatestRunStatusSince(events, awaitingReplySince),
    [awaitingReplySince, events],
  );
  const latestAgentEventSinceAwaiting = useMemo(
    () => getLatestAgentEventTimestampSince(events, awaitingReplySince),
    [awaitingReplySince, events],
  );
  const latestCompletionSignalSinceAwaiting = useMemo(
    () => getLatestCompletionSignalTimestampSince(events, awaitingReplySince),
    [awaitingReplySince, events],
  );
  const completionSignalIsFresh = useMemo(
    () => isCompletionSignalStillTerminal({
      latestCompletionSignalAt: latestCompletionSignalSinceAwaiting,
      latestAgentEventAt: latestAgentEventSinceAwaiting,
    }),
    [latestAgentEventSinceAwaiting, latestCompletionSignalSinceAwaiting],
  );

  const nonLifecycleEvents = useMemo(
    () => events.filter((event) => !isRunLifecycleEvent(event)),
    [events],
  );
  const visibleEvents = useMemo(
    () => nonLifecycleEvents.filter((event) => !isPersistedPermissionEvent(event)),
    [nonLifecycleEvents],
  );
  const latestVisibleEventId = useMemo(
    () => getLatestVisibleEvent(visibleEvents)?.id ?? null,
    [visibleEvents],
  );
  useEffect(() => {
    latestVisibleEventIdRef.current = latestVisibleEventId;
  }, [latestVisibleEventId]);
  const visibleUserEvents = useMemo(
    () => visibleEvents.filter((event) => isUserEvent(event)),
    [visibleEvents],
  );
  const visibleNonUserEvents = useMemo(
    () => visibleEvents.filter((event) => !isUserEvent(event)),
    [visibleEvents],
  );
  const deferredVisibleNonUserEvents = useDeferredValue(visibleNonUserEvents);
  const pendingUserEvents = useMemo(
    () => (activeChatIdResolved
      ? (pendingUserEventsByChat[activeChatIdResolved] ?? [])
      : []),
    [activeChatIdResolved, pendingUserEventsByChat],
  );
  const renderableStreamEvents = useMemo(() => {
    const merged = [...deferredVisibleNonUserEvents, ...visibleUserEvents, ...pendingUserEvents];
    return merged.sort((a, b) => {
      const timestampDiff = a.timestamp.localeCompare(b.timestamp);
      if (timestampDiff !== 0) {
        return timestampDiff;
      }
      return a.id.localeCompare(b.id);
    });
  }, [deferredVisibleNonUserEvents, pendingUserEvents, visibleUserEvents]);
  const userMessageJumpTargets = useMemo(
    () => resolveUserMessageJumpTargets(renderableStreamEvents),
    [renderableStreamEvents],
  );
  const expectedRenderableStreamEvents = useMemo(() => {
    const merged = [...visibleNonUserEvents, ...visibleUserEvents, ...pendingUserEvents];
    return merged.sort((a, b) => {
      const timestampDiff = a.timestamp.localeCompare(b.timestamp);
      if (timestampDiff !== 0) {
        return timestampDiff;
      }
      return a.id.localeCompare(b.id);
    });
  }, [pendingUserEvents, visibleNonUserEvents, visibleUserEvents]);
  const latestRenderableStreamEventId = useMemo(
    () => getLatestVisibleEvent(renderableStreamEvents)?.id ?? null,
    [renderableStreamEvents],
  );
  const expectedStreamItems = useMemo(
    () => buildStreamRenderItems(expectedRenderableStreamEvents, expandedActionRunIds),
    [expectedRenderableStreamEvents, expandedActionRunIds],
  );
  const streamItems = useMemo(
    () => buildStreamRenderItems(renderableStreamEvents, expandedActionRunIds),
    [expandedActionRunIds, renderableStreamEvents],
  );
  const isTailRestoreHydrated = useMemo(
    () => hasTailRestoreRenderHydrated({
      latestVisibleEventId,
      latestRenderableEventId: latestRenderableStreamEventId,
      expectedStreamItemCount: expectedStreamItems.length,
      renderedStreamItemCount: streamItems.length,
    }),
    [
      expectedStreamItems.length,
      latestRenderableStreamEventId,
      latestVisibleEventId,
      streamItems.length,
    ],
  );
  const isTailRestoreLayoutReady = resolveTailRestoreLayoutReady({
    isMobileLayout,
    isMobileLayoutHydrated,
    isViewportLayoutReady,
    isComposerDockLayoutReady,
  });
  const {
    isTailLayoutSettling,
    isInitialChatEntryPendingReveal,
    shouldStickToBottomRef,
    showScrollToBottom,
    setShowScrollToBottom,
    scrollConversationToBottom,
    syncScrollToBottomButton,
    handleJumpToBottom,
  } = useChatTailRestore({
    activeChatIdResolved,
    eventsForChatId,
    hasLoadedCurrentChat,
    hasDetachedTail,
    isTailRestoreHydrated,
    isNewChatPlaceholder,
    isWorkspaceHome,
    isTailRestoreLayoutReady,
    initialShowChatEntryLoading,
    resetToLatestWindow,
    scrollRef,
    latestVisibleEventIdRef,
  });
  const showChatTransitionLoading = shouldShowChatTransitionLoading({
    activeChatIdResolved,
    eventsForChatId,
    hasLoadedCurrentChat,
    isInitialChatEntryPendingReveal,
    isTailRestoreHydrated,
    isNewChatPlaceholder,
    isTailLayoutSettling,
  });
  const isChatEntryTailRestorePending = isInitialChatEntryPendingReveal || isTailLayoutSettling;
  const chatEntryPendingRevealClassName = showChatTransitionLoading ? styles.chatEntryPendingReveal : '';
  const { phase: sessionScrollPhase } = useSessionScrollOrchestrator();
  const sessionScrollPhaseRef = useRef<SessionScrollPhase>('idle');
  const resumeSettleRafRef = useRef(0);
  const resumeSettleTimeoutRef = useRef(0);
  const resumePreviousMetricsRef = useRef<{ scrollTop: number | null; viewportHeight: number | null } | null>(null);
  const resumeStableFrameCountRef = useRef(0);

  useEffect(() => {
    sessionScrollPhaseRef.current = sessionScrollPhase;
  }, [sessionScrollPhase]);

  useEffect(() => {
    return () => {
      if (composerDockLayoutReadyTimeoutRef.current) {
        window.clearTimeout(composerDockLayoutReadyTimeoutRef.current);
      }
    };
  }, []);

  const clearResumePhaseSettleLoop = useCallback(() => {
    if (resumeSettleRafRef.current) {
      window.cancelAnimationFrame(resumeSettleRafRef.current);
      resumeSettleRafRef.current = 0;
    }
    if (resumeSettleTimeoutRef.current) {
      window.clearTimeout(resumeSettleTimeoutRef.current);
      resumeSettleTimeoutRef.current = 0;
    }
    resumePreviousMetricsRef.current = null;
    resumeStableFrameCountRef.current = 0;
  }, []);

  const completeResumeScrollPhase = useCallback(() => {
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'resume:complete',
      streamElement: scrollRef.current,
      detail: {
        currentPhase: sessionScrollPhaseRef.current,
      },
    });
    clearResumePhaseSettleLoop();
    dispatchSessionScrollPhaseEvent('resume-stable');
  }, [clearResumePhaseSettleLoop]);

  const startResumeScrollPhase = useCallback(() => {
    if (!isMobileLayout || isWorkspaceHome || isNewChatPlaceholder || !activeChatIdResolved) {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'resume:start:skipped',
        streamElement: scrollRef.current,
        detail: {
          isMobileLayout,
          isWorkspaceHome,
          isNewChatPlaceholder,
          activeChatIdResolved,
        },
      });
      return;
    }

    clearResumePhaseSettleLoop();
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'resume:start',
      streamElement: scrollRef.current,
      detail: {
        activeChatIdResolved,
      },
    });
    dispatchSessionScrollPhaseEvent('resume-start');

    const settle = () => {
      const currentPhase = sessionScrollPhaseRef.current;
      if (currentPhase !== 'resuming' && currentPhase !== 'viewport-reflow') {
        clearResumePhaseSettleLoop();
        return;
      }

      const stream = scrollRef.current;
      const nextMetrics = {
        scrollTop: stream?.scrollTop ?? null,
        viewportHeight: stream?.clientHeight ?? null,
      };

      if (resumePreviousMetricsRef.current && hasResumePhaseSettled({
        previousScrollTop: resumePreviousMetricsRef.current.scrollTop,
        nextScrollTop: nextMetrics.scrollTop,
        previousViewportHeight: resumePreviousMetricsRef.current.viewportHeight,
        nextViewportHeight: nextMetrics.viewportHeight,
      })) {
        resumeStableFrameCountRef.current += 1;
      } else {
        resumeStableFrameCountRef.current = 0;
      }
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'resume:settle:frame',
        streamElement: scrollRef.current,
        detail: {
          currentPhase,
          activeChatIdResolved,
          nextMetrics,
          previousMetrics: resumePreviousMetricsRef.current,
          stableFrameCount: resumeStableFrameCountRef.current,
        },
      });

      resumePreviousMetricsRef.current = nextMetrics;
      if (resumeStableFrameCountRef.current >= 2) {
        completeResumeScrollPhase();
        return;
      }

      resumeSettleRafRef.current = window.requestAnimationFrame(settle);
    };

    resumeSettleRafRef.current = window.requestAnimationFrame(settle);
    resumeSettleTimeoutRef.current = window.setTimeout(() => {
      completeResumeScrollPhase();
    }, RESUME_SCROLL_SETTLE_TIMEOUT_MS);
  }, [
    activeChatIdResolved,
    clearResumePhaseSettleLoop,
    completeResumeScrollPhase,
    isMobileLayout,
    isNewChatPlaceholder,
    isWorkspaceHome,
  ]);

  useEffect(() => {
    if (!isMobileLayout || isWorkspaceHome || isNewChatPlaceholder || !activeChatIdResolved) {
      return;
    }

    dispatchSessionScrollPhaseEvent(isTailLayoutSettling ? 'tail-restore-start' : 'tail-restore-complete');
  }, [
    activeChatIdResolved,
    isMobileLayout,
    isNewChatPlaceholder,
    isTailLayoutSettling,
    isWorkspaceHome,
  ]);
  const persistedPermissions = useMemo(
    () => hydratePersistedPermissions(nonLifecycleEvents),
    [nonLifecycleEvents],
  );
  const mergedDisplayPermissions = useMemo(
    () => mergeRenderablePermissions(displayPermissions, persistedPermissions),
    [displayPermissions, persistedPermissions],
  );
  const effectivePendingPermissions = useMemo(
    () => mergedDisplayPermissions.filter((permission) => permission.state === 'pending'),
    [mergedDisplayPermissions],
  );
  // Permission decisions must surface immediately; deferring this list can
  // briefly re-render stale pending state and show the wrong hint.
  const permissionTimelineItems = useMemo(
    () => buildPermissionTimelineItems(mergedDisplayPermissions),
    [mergedDisplayPermissions],
  );
  const timelineItems = useMemo<TimelineRenderItem[]>(() => {
    const merged: TimelineRenderItem[] = [];
    let order = 0;

    for (const item of streamItems) {
      const timestamp = item.type === 'event' ? item.event.timestamp : item.timestamp;
      const parsed = Date.parse(timestamp);
      merged.push({
        type: 'stream',
        item,
        sortKey: Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER / 8 + order,
        order,
      });
      order += 1;
    }

    if (showPermissionQueue) {
      for (const permission of permissionTimelineItems) {
        merged.push({
          ...permission,
          order,
        });
        order += 1;
      }
    }

    return merged.sort((a, b) => {
      if (a.sortKey !== b.sortKey) {
        return a.sortKey - b.sortKey;
      }
      return a.order - b.order;
    });
  }, [permissionTimelineItems, showPermissionQueue, streamItems]);
  const firstPendingPermissionId = effectivePendingPermissions[0]?.id ?? null;
  const runPhase: ChatRunPhase = resolveRunPhaseState({
    isAborting,
    isSubmitting,
    hasCompletionSignal,
    completionSignalIsFresh,
    runtimeRunning,
    isAwaitingReply,
    runStatus: latestRunStatus,
    hasPendingPermission: effectivePendingPermissions.length > 0,
  });
  const runPhaseLabel = runPhase === 'idle' ? null : CHAT_RUN_PHASE_LABELS[runPhase];
  const isRunActive = runPhase === 'submitting' || runPhase === 'running' || runPhase === 'approval' || runPhase === 'aborting';
  const isAgentRunning = runPhase !== 'idle';
  const connectionState: 'running' | 'connected' | 'degraded' = isAgentRunning
    ? 'running'
    : runtimeNotice
      ? 'degraded'
      : 'connected';
  const progressMeta = isRunActive ? extractProgressMeta(events) : null;
  const connectionLabel = connectionState === 'running'
    ? buildProgressLabel(runPhaseLabel ?? '실행 중', progressMeta)
    : connectionState === 'connected'
      ? '정상 연결'
      : '응답 지연 또는 연결 확인 필요';
  const {
    approvalFeedbackByChat,
    chatSidebarSnapshots,
    handleMarkChatAsRead,
    handleSidebarPermissionDecision,
    hasMoreChats,
    resolveChatPreviewText,
    resolveChatSidebarState,
    resolveSidebarChatRunPhase,
    sidebarApprovalLoadingChatId,
    sidebarSections,
  } = useChatSidebarState({
    activeChatIdResolved,
    chats,
    events,
    eventsForChatId,
    initialChats,
    initialEvents,
    activeChatId,
    visibleEvents,
    isAgentRunning,
    isSessionSyncLeader,
    sessionId,
    runtimeRunning,
    chatRuntimeUiByChat,
    effectivePendingPermissions,
    submitError,
    syncError,
    runtimeError,
    showDisconnectRetry,
    pendingPermissions,
    decidePermission,
    isOperator,
    setChatMutationError,
    isAuxSyncReady,
    isAwaitingReply,
    isSubmitting,
    isAborting,
    chatListRef,
    chatListSentinelRef,
    isChatSidebarOpen,
    setChats,
  });

  useEffect(() => {
    const handleWorkspaceFileOpen = (event: Event) => {
      const detail = (event as CustomEvent<WorkspaceFileOpenDetail>).detail;
      if (!detail?.path) {
        return;
      }

      // If the path is a host absolute path (e.g. /home/ubuntu/project/ARIS/services/...),
      // strip the project prefix and resolve relative to the workspace root.
      const normalizedProjectName = projectName.replace(/\/+$/, '');
      let resolvedPath = detail.path;
      if (
        normalizedProjectName
        && (resolvedPath === normalizedProjectName || resolvedPath.startsWith(`${normalizedProjectName}/`))
      ) {
        const relPart = resolvedPath.slice(normalizedProjectName.length).replace(/^\/+/, '');
        resolvedPath = joinWorkspacePath(normalizedWorkspaceRootPath, relPart);
      }

      const normalizedTarget = normalizeWorkspaceClientPath(resolvedPath);
      let finalPath: string;
      if (isWorkspacePathWithinRoot(normalizedTarget, normalizedWorkspaceRootPath)) {
        // 이미 workspace root 내의 경로 → 그대로 사용
        finalPath = normalizedTarget;
      } else {
        // 절대 경로(worktree 등 sibling 디렉터리)인 경우:
        // /home/ubuntu/project/ARIS-wt-xxx/services/file.ts
        // → /home/ubuntu/project/ARIS/services/file.ts 로 재매핑
        const workspaceParentDir = normalizedWorkspaceRootPath.includes('/')
          ? normalizedWorkspaceRootPath.slice(0, normalizedWorkspaceRootPath.lastIndexOf('/'))
          : '';
        if (workspaceParentDir && normalizedTarget.startsWith(`${workspaceParentDir}/`)) {
          const afterParent = normalizedTarget.slice(workspaceParentDir.length + 1);
          const slashIdx = afterParent.indexOf('/');
          const relPart = slashIdx !== -1 ? afterParent.slice(slashIdx + 1) : '';
          finalPath = relPart
            ? joinWorkspacePath(normalizedWorkspaceRootPath, relPart)
            : normalizedWorkspaceRootPath;
        } else {
          finalPath = joinWorkspacePath(normalizedWorkspaceRootPath, normalizedTarget);
        }
      }

      sidebarFileRequestNonceRef.current += 1;
      setSidebarFileRequest({
        path: finalPath,
        name: detail.name,
        line: detail.line ?? null,
        nonce: sidebarFileRequestNonceRef.current,
      });

      if (explorerWorkspacePanel) {
        setActiveWorkspacePageId(explorerWorkspacePanel.id);
      } else {
        void createWorkspacePanel('explorer').catch(() => {
          // The shared workspace panel error banner surfaces the failure.
        });
      }

      if (isLeftSidebarOverlayLayout) {
        setIsChatSidebarOpen(false);
      }
    };

    window.addEventListener(WORKSPACE_FILE_OPEN_EVENT, handleWorkspaceFileOpen as EventListener);
    return () => {
      window.removeEventListener(WORKSPACE_FILE_OPEN_EVENT, handleWorkspaceFileOpen as EventListener);
    };
  }, [
    createWorkspacePanel,
    explorerWorkspacePanel,
    isLeftSidebarOverlayLayout,
    normalizedWorkspaceRootPath,
    projectName,
    setActiveWorkspacePageId,
    setIsChatSidebarOpen,
    setSidebarFileRequest,
  ]);

  useEffect(() => {
    resetChatUiState();
    setChatMutationError(null);
  }, [activeChatId, initialChats, resetChatUiState, setChatMutationError]);

  useEffect(() => {
    disconnectNoticeAwaitingRef.current = null;
    runtimeStartedSinceAwaitingRef.current = false;
  }, [activeChatIdResolved]);

  const deleteUploadedImageAsset = useCallback((attachment: ChatImageAttachment, keepalive = false) => {
    void fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/assets/images`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ serverPath: attachment.serverPath }),
      ...(keepalive ? { keepalive: true } : {}),
    }).catch(() => {});
  }, [sessionId]);

  useEffect(() => {
    const handleDraftCleanup = () => {
      if (isSubmittingRef.current) {
        return;
      }
      for (const item of contextItemsRef.current) {
        if (item.type === 'image') {
          deleteUploadedImageAsset(item.attachment, true);
        }
      }
    };

    window.addEventListener('beforeunload', handleDraftCleanup);
    window.addEventListener('pagehide', handleDraftCleanup);
    return () => {
      handleDraftCleanup();
      window.removeEventListener('beforeunload', handleDraftCleanup);
      window.removeEventListener('pagehide', handleDraftCleanup);
    };
  }, [deleteUploadedImageAsset]);

  useEffect(() => {
    if (plusMenuMode === 'closed' && !isModelDropdownOpen && !isGeminiModeDropdownOpen && !isCommandMenuOpen) return;
    function handleOutsideClick(e: MouseEvent) {
      if (plusMenuRef.current && !plusMenuRef.current.contains(e.target as Node)) {
        setPlusMenuMode('closed');
      }
      if (modelDropdownRef.current && !modelDropdownRef.current.contains(e.target as Node)) {
        setIsModelDropdownOpen(false);
      }
      if (geminiModeDropdownRef.current && !geminiModeDropdownRef.current.contains(e.target as Node)) {
        setIsGeminiModeDropdownOpen(false);
      }
      if (commandMenuRef.current && !commandMenuRef.current.contains(e.target as Node)) {
        setIsCommandMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [
    plusMenuMode,
    isModelDropdownOpen,
    isGeminiModeDropdownOpen,
    isCommandMenuOpen,
    setIsCommandMenuOpen,
    setIsGeminiModeDropdownOpen,
    setIsModelDropdownOpen,
    setPlusMenuMode,
  ]);

  const removeContextItem = useCallback((itemToRemove: ContextItem) => {
    if (itemToRemove.type === 'image') {
      deleteUploadedImageAsset(itemToRemove.attachment);
    }
    setContextItems((prev) => prev.filter((item) => item.id !== itemToRemove.id));
  }, [deleteUploadedImageAsset, setContextItems]);

  const handleAddTextContext = useCallback(() => {
    const text = textContextInput.trim();
    if (!text) return;
    setContextItems((prev) => [...prev, { id: genId(), type: 'text', text }]);
    setTextContextInput('');
    setPlusMenuMode('closed');
  }, [textContextInput, setContextItems, setPlusMenuMode, setTextContextInput]);

  const fetchFileBrowserDir = useCallback(async (dirPath: string) => {
    setFileBrowserLoading(true);
    setFileBrowserError(null);
    try {
      const res = await fetch(`/api/fs/list?path=${encodeURIComponent(dirPath)}`);
      const data = (await res.json().catch(() => ({}))) as {
        directories?: Array<{ name: string; path: string; isDirectory: boolean; isFile: boolean }>;
        parentPath?: string | null;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? '디렉토리를 읽을 수 없습니다.');
      const normalizedDirPath = normalizeWorkspaceClientPath(dirPath);
      setFileBrowserPath(normalizedDirPath);
      setFileBrowserItems(data.directories ?? []);
      const nextParentPath = data.parentPath && isWorkspacePathWithinRoot(data.parentPath, normalizedWorkspaceRootPath)
        ? data.parentPath
        : null;
      setFileBrowserParentPath(nextParentPath);
    } catch (err) {
      setFileBrowserError(err instanceof Error ? err.message : '디렉토리 읽기 실패');
    } finally {
      setFileBrowserLoading(false);
    }
  }, [
    normalizedWorkspaceRootPath,
    setFileBrowserError,
    setFileBrowserItems,
    setFileBrowserLoading,
    setFileBrowserParentPath,
    setFileBrowserPath,
  ]);

  const handleFileBrowserOpen = useCallback(() => {
    setPlusMenuMode('file');
    setFileBrowserQuery('');
    setFileBrowserSearchResults(null);
    setRecentAttachments(getRecentFiles());
    void fetchFileBrowserDir(normalizedWorkspaceRootPath);
  }, [
    fetchFileBrowserDir,
    normalizedWorkspaceRootPath,
    setFileBrowserQuery,
    setFileBrowserSearchResults,
    setPlusMenuMode,
    setRecentAttachments,
  ]);

  const handleFileBrowserSearch = useCallback(async (query: string) => {
    setFileBrowserQuery(query);
    if (!query.trim()) {
      setFileBrowserSearchResults(null);
      return;
    }
    setFileBrowserSearchLoading(true);
    try {
      const res = await fetch(`/api/fs/search?q=${encodeURIComponent(query.trim())}&path=${encodeURIComponent(normalizedWorkspaceRootPath)}`);
      const data = (await res.json().catch(() => ({}))) as {
        results?: Array<{ name: string; path: string; isDirectory: boolean }>;
        error?: string;
      };
      if (!res.ok || data.error) throw new Error(data.error ?? '검색 실패');
      setFileBrowserSearchResults(data.results ?? []);
    } catch {
      setFileBrowserSearchResults([]);
    } finally {
      setFileBrowserSearchLoading(false);
    }
  }, [
    normalizedWorkspaceRootPath,
    setFileBrowserQuery,
    setFileBrowserSearchLoading,
    setFileBrowserSearchResults,
  ]);

  const handleFileBrowserSelect = useCallback(async (filePath: string) => {
    setFileBrowserLoading(true);
    setFileBrowserError(null);
    try {
      const res = await fetch(`/api/fs/read?path=${encodeURIComponent(filePath)}`);
      const data = (await res.json().catch(() => ({}))) as { content?: string; error?: string };
      if (!res.ok || data.error) throw new Error(data.error ?? '파일을 읽을 수 없습니다.');
      const name = filePath.split('/').filter(Boolean).pop() ?? filePath;
      setContextItems((prev) => [...prev, { id: genId(), type: 'file', path: filePath, content: data.content ?? '', name }]);
      saveRecentFile(filePath);
      setPlusMenuMode('closed');
    } catch (err) {
      setFileBrowserError(err instanceof Error ? err.message : '파일 읽기 실패');
    } finally {
      setFileBrowserLoading(false);
    }
  }, [
    setContextItems,
    setFileBrowserError,
    setFileBrowserLoading,
    setPlusMenuMode,
  ]);

  const handleImageUploadOpen = useCallback(() => {
    if (imageUploadsInFlight > 0) {
      return;
    }
    setPlusMenuMode('closed');
    setImageUploadError(null);
    composerImageInputRef.current?.click();
  }, [imageUploadsInFlight, setImageUploadError, setPlusMenuMode]);

  const handleComposerImageSelection = useCallback(async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) {
      return;
    }

    setImageUploadsInFlight((prev) => prev + 1);
    setImageUploadError(null);
    try {
      const formData = new FormData();
      formData.set('file', file);

      const response = await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/assets/images`, {
        method: 'POST',
        body: formData,
      });
      const payload = (await response.json().catch(() => ({}))) as {
        attachment?: ChatImageAttachment;
        error?: string;
      };
      const attachment = payload.attachment;
      if (!response.ok || !attachment) {
        throw new Error(payload.error ?? '이미지 업로드에 실패했습니다.');
      }

      setContextItems((prev) => [...prev, { id: genId(), type: 'image', attachment }]);
    } catch (error) {
      setImageUploadError(error instanceof Error ? error.message : '이미지 업로드에 실패했습니다.');
    } finally {
      setImageUploadsInFlight((prev) => Math.max(0, prev - 1));
    }
  }, [sessionId, setContextItems, setImageUploadError, setImageUploadsInFlight]);

  const markSessionAsRead = useCallback(async () => {
    if (!isSessionSyncLeader) {
      return;
    }

    try {
      await fetch(`/api/runtime/sessions/${encodeURIComponent(sessionId)}/metadata`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lastReadAt: new Date().toISOString() }),
      });
    } catch {
      // Best-effort cursor sync.
    }
  }, [isSessionSyncLeader, sessionId]);

  useEffect(() => {
    setExpandedResultIds({});
    setExpandedActionRunIds({});
  }, [sessionId, setExpandedActionRunIds, setExpandedResultIds]);

  useEffect(() => {
    if (!isSessionSyncLeader) {
      return;
    }

    if (typeof document !== 'undefined' && document.visibilityState !== 'visible') {
      return;
    }
    const timer = window.setTimeout(() => {
      void markSessionAsRead();
    }, READ_CURSOR_SYNC_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [sessionId, events.length, isSessionSyncLeader, effectivePendingPermissions.length, markSessionAsRead]);

  useEffect(() => {
    if (!isSessionSyncLeader) {
      return undefined;
    }

    const syncWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        void markSessionAsRead();
      }
    };

    document.addEventListener('visibilitychange', syncWhenVisible);
    window.addEventListener('focus', syncWhenVisible);
    return () => {
      document.removeEventListener('visibilitychange', syncWhenVisible);
      window.removeEventListener('focus', syncWhenVisible);
    };
  }, [isSessionSyncLeader, markSessionAsRead]);

  const toggleResult = useCallback((eventId: string) => {
    setExpandedResultIds((prev) => ({
      ...prev,
      [eventId]: !prev[eventId],
    }));
  }, [setExpandedResultIds]);

  const toggleActionRun = useCallback((runId: string) => {
    setExpandedActionRunIds((prev) => ({
      ...prev,
      [runId]: !prev[runId],
    }));
  }, [setExpandedActionRunIds]);

  const captureVisibleHistoryAnchor = useCallback((): OlderLoadAnchorSnapshot | null => {
    const stream = scrollRef.current;
    if (!stream) {
      return null;
    }

    const streamTop = stream.getBoundingClientRect().top;
    const messageRows = Array.from(stream.querySelectorAll<HTMLElement>(`.${styles.messageRow}`));
    for (const row of messageRows) {
      const rect = row.getBoundingClientRect();
      if (rect.bottom <= streamTop + 1) {
        continue;
      }
      return {
        chatId: activeChatIdResolved,
        element: row,
        topOffset: rect.top - streamTop,
      };
    }

    return null;
  }, [activeChatIdResolved]);

  useLayoutEffect(() => {
    const pendingAnchor = pendingOlderLoadAnchorRef.current;
    if (!pendingAnchor) {
      return;
    }
    if (pendingAnchor.chatId !== activeChatIdResolved) {
      pendingOlderLoadAnchorRef.current = null;
      return;
    }
    if (isLoadingOlder) {
      return;
    }

    pendingOlderLoadAnchorRef.current = null;
    const stream = scrollRef.current;
    if (!stream || !pendingAnchor.element.isConnected || !stream.contains(pendingAnchor.element)) {
      return;
    }

    const streamTop = stream.getBoundingClientRect().top;
    const nextAnchorOffset = pendingAnchor.element.getBoundingClientRect().top - streamTop;
    const nextScrollTop = resolvePrependedAnchorScrollTop({
      currentScrollTop: stream.scrollTop,
      previousAnchorOffset: pendingAnchor.topOffset,
      nextAnchorOffset,
    });

    if (Math.abs(nextScrollTop - stream.scrollTop) <= 0.5) {
      return;
    }

    recordScrollDebugEvent({
      kind: 'write',
      source: 'history:restoreAnchorAfterOlderLoad',
      top: nextScrollTop,
      streamElement: stream,
      detail: {
        previousAnchorOffset: pendingAnchor.topOffset,
        nextAnchorOffset,
      },
    });
    stream.scrollTop = nextScrollTop;
  }, [activeChatIdResolved, events, isLoadingOlder]);

  const loadOlderHistory = useCallback(async () => {
    if (shouldBlockLoadOlder({
      isTailLayoutSettling,
      isLoadingOlder,
      hasMoreBefore,
      scrollPhase: sessionScrollPhase,
    })) {
      return;
    }

    pendingOlderLoadAnchorRef.current = captureVisibleHistoryAnchor();
    dispatchSessionScrollPhaseEvent('older-load-start');

    const completeOlderLoad = () => {
      dispatchSessionScrollPhaseEvent('older-load-complete');
    };

    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'history:loadOlder:button:stream',
      top: scrollRef.current?.scrollTop ?? 0,
      detail: {
        hasMoreBefore,
        isLoadingOlder,
        sessionScrollPhase,
      },
    });
    const olderLoadResult = await loadOlder().catch(() => {
      pendingOlderLoadAnchorRef.current = null;
      return null;
    });
    if (!olderLoadResult || olderLoadResult.loadedCount <= 0) {
      pendingOlderLoadAnchorRef.current = null;
    }

    requestAnimationFrame(completeOlderLoad);
  }, [captureVisibleHistoryAnchor, hasMoreBefore, isLoadingOlder, isTailLayoutSettling, loadOlder, sessionScrollPhase]);

  const handleLoadOlderButtonClick = useCallback(() => {
    void loadOlderHistory();
  }, [loadOlderHistory]);

  const syncComposerDockMetrics = useCallback(() => {
    const shell = chatShellRef.current;
    const centerPanel = centerPanelRef.current;
    const dock = composerDockRef.current;
    if (!shell || !dock) {
      return;
    }

    const height = Math.ceil(dock.getBoundingClientRect().height);
    shell.style.setProperty('--composer-dock-height', `${height}px`);
    let left = 0;
    let nextWidth = 0;
    if (centerPanel) {
      const viewportWidth = window.innerWidth;
      const rect = centerPanel.getBoundingClientRect();
      const inset = viewportWidth <= 960 ? 10 : 12;
      left = Math.max(inset, Math.round(rect.left) + inset);
      const maxWidth = Math.max(240, viewportWidth - inset * 2);
      nextWidth = Math.max(240, Math.min(maxWidth, Math.round(rect.width) - inset * 2));
    }

    const nextMetrics = {
      height,
      left,
      width: nextWidth,
    };
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'composer:syncDockMetrics',
      streamElement: scrollRef.current,
      detail: {
        nextMetrics,
        hasCenterPanel: Boolean(centerPanel),
        isMobileLayout,
      },
    });
    if (isMobileLayout && haveComposerDockMetricsChanged(composerDockMetricsRef.current, nextMetrics)) {
      composerDockMetricsRef.current = nextMetrics;
      if (composerDockLayoutReadyTimeoutRef.current) {
        window.clearTimeout(composerDockLayoutReadyTimeoutRef.current);
      }
      setIsComposerDockLayoutReady(false);
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'composer:dockLayoutReady:false',
        streamElement: scrollRef.current,
        detail: {
          nextMetrics,
        },
      });
      composerDockLayoutReadyTimeoutRef.current = window.setTimeout(() => {
        composerDockLayoutReadyTimeoutRef.current = 0;
        setIsComposerDockLayoutReady(true);
        recordScrollDebugEvent({
          kind: 'trigger',
          source: 'composer:dockLayoutReady:true',
          streamElement: scrollRef.current,
          detail: {
            nextMetrics,
          },
        });
      }, 160);
    }

    if (!centerPanel) {
      return;
    }

    shell.style.setProperty('--composer-dock-left', `${left}px`);
    shell.style.setProperty('--composer-dock-width', `${nextWidth}px`);
  }, [isMobileLayout]);

  const resizeComposerInput = useCallback(() => {
    const input = composerInputRef.current;
    if (!input) {
      return;
    }

    input.style.height = '0px';
    const nextHeight = Math.min(COMPOSER_MAX_HEIGHT_PX, Math.max(COMPOSER_MIN_HEIGHT_PX, input.scrollHeight));
    input.style.height = `${nextHeight}px`;
    input.style.overflowY = nextHeight >= COMPOSER_MAX_HEIGHT_PX ? 'auto' : 'hidden';
    requestAnimationFrame(syncComposerDockMetrics);
  }, [syncComposerDockMetrics]);

  const handleComposerFocus = useCallback(() => {
    if (isMobileLayout) {
      shouldStickToBottomRef.current = false;
      return;
    }

    shouldStickToBottomRef.current = true;
    requestAnimationFrame(() => {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'chat:composer-focus:auto-scroll',
      });
      scrollConversationToBottom('auto');
    });
  }, [isMobileLayout, scrollConversationToBottom, shouldStickToBottomRef]);

  const {
    handleAbortRun,
    handleSubmit,
  } = useChatRunActions({
    activeAgentFlavor,
    activeChat,
    activeChatIdResolved,
    addEvent,
    approvalPolicy,
    codexReasoningEffort: codexReasoningEffort ?? 'medium',
    contextItems,
    disconnectNoticeAwaitingRef,
    events,
    eventsForChatId,
    imageUploadsInFlight,
    isAborting,
    isAgentRunning,
    isOperator,
    lastSelectedCodexModelId,
    legacyCustomModels,
    pendingUserEvents,
    prompt,
    providerSelections,
    runtimeStartedSinceAwaitingRef,
    sessionScrollPhase,
    scrollConversationToBottom,
    selectedGeminiModeId,
    selectedModelId,
    sessionId,
    setChats,
    setContextItems,
    setPendingUserEventsByChat,
    setPrompt,
    setShowScrollToBottom,
    shouldStickToBottomRef,
    updateChatRuntimeUi,
  });

  const {
    handleCancelTextContext,
    handleGeminiModeSelect,
    handleModelReasoningEffortSelect,
    handleModelSelect,
    handleOpenTextContextEditor,
    handlePromptKeyDown,
    handleToggleCommandMenu,
    handleToggleGeminiModeDropdown,
    handleToggleModelDropdown,
    handleTogglePlusMenu,
  } = useChatComposerInteractions({
    handleSelectGeminiMode,
    handleSelectModel,
    handleSelectModelReasoningEffort,
    handleSubmit,
    setIsCommandMenuOpen,
    setIsGeminiModeDropdownOpen,
    setIsModelDropdownOpen,
    setPlusMenuMode,
    setTextContextInput,
  });
  const {
    handleBackFromWorkspaceHome,
    handleGoHome,
    handleOpenNewChat,
    handleReturnToWorkspaceHome,
    handleSelectWorkspaceChat,
  } = useChatCenterNavigationActions({
    isMobileLayout,
    router,
    sessionId,
    setIsChatSidebarOpen,
    setIsNewChatPlaceholder,
    setIsWorkspaceHome,
    setSelectedChatId,
  });
  const {
    handleCopyChatId,
    handleCopyChatThreadIdsJson,
    handleRetryDisconnected,
    handleToggleChatSidebar,
    handleToggleContextMenu,
    handleTogglePermissionQueue,
    handleUpdateApprovalPolicy,
    jumpToPendingPermission,
  } = useChatHeaderStatusControls({
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
  });
  const syncLastUserMessageJumpTarget = useCallback(() => {
    if (isWorkspaceHome || isNewChatPlaceholder || userMessageJumpTargets.length === 0) {
      setLastUserMessageJumpTarget(null);
      return;
    }

    const scrollBoundary = Math.ceil(scrollRef.current?.getBoundingClientRect().top ?? 0);
    const bubbleBottomByEventId = new Map<string, number>();

    userMessageBubbleNodesRef.current.forEach((node, eventId) => {
      bubbleBottomByEventId.set(eventId, node.getBoundingClientRect().bottom);
    });

    setLastUserMessageJumpTarget(resolveLastPassedUserMessageJumpTarget({
      targets: userMessageJumpTargets,
      bubbleBottomByEventId,
      scrollBoundary,
    }));
  }, [
    isNewChatPlaceholder,
    isWorkspaceHome,
    scrollRef,
    userMessageJumpTargets,
  ]);

  const syncConversationScrollState = useCallback(() => {
    const stream = scrollRef.current;
    if (!stream) {
      return;
    }

    if (isMobileLayout) {
      if (sessionScrollPhaseRef.current === 'resuming' || sessionScrollPhaseRef.current === 'viewport-reflow') {
        recordScrollDebugEvent({
          kind: 'trigger',
          source: 'chat:updateStickState:suppressed',
          streamElement: stream,
          detail: {
            currentPhase: sessionScrollPhaseRef.current,
          },
        });
        return;
      }

      const nextState = resolveMobileBottomLockState({
        isNearBottom: isNearBottom(stream),
        hasDetachedTail,
        isTailRestorePending: isChatEntryTailRestorePending,
      });
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'chat:updateStickState',
        streamElement: stream,
        detail: {
          currentPhase: sessionScrollPhaseRef.current,
          isChatEntryTailRestorePending,
          nextState,
        },
      });
      shouldStickToBottomRef.current = nextState.shouldStickToBottom;
      setShowScrollToBottom(nextState.showScrollToBottom);
      return;
    }

    const nearBottom = isNearBottom(stream);
    shouldStickToBottomRef.current = nearBottom && !hasDetachedTail;
    setShowScrollToBottom(hasDetachedTail || !nearBottom);
  }, [
    hasDetachedTail,
    isChatEntryTailRestorePending,
    isMobileLayout,
    setShowScrollToBottom,
    shouldStickToBottomRef,
  ]);

  const showLastUserMessageJumpBar = useMemo(() => shouldShowLastUserMessageJumpBar({
    targetEventId: lastUserMessageJumpTarget?.eventId ?? null,
    isWorkspaceHome,
    isNewChatPlaceholder,
    showChatTransitionLoading,
    showScrollToBottom,
  }), [
    isNewChatPlaceholder,
    isWorkspaceHome,
    lastUserMessageJumpTarget?.eventId,
    showChatTransitionLoading,
    showScrollToBottom,
  ]);

  const handleLastUserMessageJump = useCallback(() => {
    const targetEventId = lastUserMessageJumpTarget?.eventId;
    if (!targetEventId) {
      return;
    }

    const eventElement = document.getElementById(`event-${targetEventId}`);
    if (!eventElement) {
      return;
    }

    eventElement.scrollIntoView({ behavior: 'smooth', block: 'start', inline: 'nearest' });
    setHighlightedEventId(null);
    window.requestAnimationFrame(() => {
      setHighlightedEventId(targetEventId);
    });
  }, [lastUserMessageJumpTarget?.eventId, setHighlightedEventId]);

  const setUserMessageBubbleNode = useCallback((eventId: string, node: HTMLDivElement | null) => {
    if (node) {
      userMessageBubbleNodesRef.current.set(eventId, node);
      return;
    }

    userMessageBubbleNodesRef.current.delete(eventId);
  }, []);

  useEffect(() => {
    if (!isContextMenuOpen) {
      return;
    }
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (contextMenuRef.current?.contains(target)) {
        return;
      }
      setIsContextMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [isContextMenuOpen, setIsContextMenuOpen]);

  useEffect(() => {
    if (!chatActionMenuId) {
      return;
    }
    const onClickOutside = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) {
        return;
      }
      if (chatActionMenuRef.current?.contains(target)) {
        return;
      }
      if (target.closest(`.${styles.chatListMenuButton}`)) {
        return;
      }
      closeSidebarMenu();
    };
    document.addEventListener('mousedown', onClickOutside);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
    };
  }, [chatActionMenuId, closeSidebarMenu]);

  useEffect(() => {
    if (!chatActionMenuId) {
      return;
    }
    const onScroll = () => {
      closeSidebarMenu();
    };
    const chatListEl = chatListRef.current;
    if (chatListEl) {
      chatListEl.addEventListener('scroll', onScroll, { passive: true });
    }
    window.addEventListener('scroll', onScroll, { passive: true, capture: true });
    return () => {
      if (chatListEl) {
        chatListEl.removeEventListener('scroll', onScroll);
      }
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  }, [chatActionMenuId, closeSidebarMenu]);

  useEffect(() => {
    resizeComposerInput();
  }, [prompt, resizeComposerInput]);

  useLayoutEffect(() => {
    syncComposerDockMetrics();
  }, [
    activeChatIdResolved,
    isChatSidebarOpen,
    isLeftSidebarOverlayLayout,
    isNewChatPlaceholder,
    isWorkspaceHome,
    syncComposerDockMetrics,
  ]);

  useLayoutEffect(() => {
    syncLastUserMessageJumpTarget();
  }, [syncLastUserMessageJumpTarget]);

  useEffect(() => {
    syncComposerDockMetrics();
    const handleResize = () => syncComposerDockMetrics();
    window.addEventListener('resize', handleResize, { passive: true });
    window.visualViewport?.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      window.visualViewport?.removeEventListener('resize', handleResize);
    };
  }, [syncComposerDockMetrics]);

  useEffect(() => {
    const scheduleSync = () => {
      window.requestAnimationFrame(syncLastUserMessageJumpTarget);
    };

    scheduleSync();
    window.addEventListener('resize', scheduleSync, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleSync);

    return () => {
      window.removeEventListener('resize', scheduleSync);
      window.visualViewport?.removeEventListener('resize', scheduleSync);
    };
  }, [syncLastUserMessageJumpTarget]);

  useEffect(() => {
    if (!isMobileLayout || isWorkspaceHome || isNewChatPlaceholder || !activeChatIdResolved) {
      clearResumePhaseSettleLoop();
      deactivateSessionScrollOrchestrator();
      return;
    }

    activateSessionScrollOrchestrator();

    const onResume = () => {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'resume:onResume',
        streamElement: scrollRef.current,
        detail: {
          visibilityState: document.visibilityState,
        },
      });
      if (document.visibilityState === 'hidden') {
        return;
      }
      startResumeScrollPhase();
    };
    const onViewportChanged = () => {
      const currentPhase = sessionScrollPhaseRef.current;
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'resume:onViewportChanged',
        streamElement: scrollRef.current,
        detail: {
          currentPhase,
        },
      });
      if (currentPhase !== 'resuming' && currentPhase !== 'viewport-reflow') {
        return;
      }
      dispatchSessionScrollPhaseEvent('viewport-changed');
    };

    window.addEventListener('focus', onResume);
    window.addEventListener('pageshow', onResume);
    document.addEventListener('visibilitychange', onResume);
    window.visualViewport?.addEventListener('resize', onViewportChanged);
    window.visualViewport?.addEventListener('scroll', onViewportChanged);

    return () => {
      clearResumePhaseSettleLoop();
      deactivateSessionScrollOrchestrator();
      window.removeEventListener('focus', onResume);
      window.removeEventListener('pageshow', onResume);
      document.removeEventListener('visibilitychange', onResume);
      window.visualViewport?.removeEventListener('resize', onViewportChanged);
      window.visualViewport?.removeEventListener('scroll', onViewportChanged);
    };
  }, [
    activeChatIdResolved,
    clearResumePhaseSettleLoop,
    isMobileLayout,
    isNewChatPlaceholder,
    isWorkspaceHome,
    startResumeScrollPhase,
  ]);

  useEffect(() => {
    if (!isMobileLayout) {
      syncConversationScrollState();
      return;
    }

    const scheduleSync = () => {
      window.requestAnimationFrame(syncConversationScrollState);
    };

    const rafId = window.requestAnimationFrame(syncConversationScrollState);
    window.addEventListener('resize', scheduleSync, { passive: true });
    window.visualViewport?.addEventListener('resize', scheduleSync);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleSync);
      window.visualViewport?.removeEventListener('resize', scheduleSync);
    };
  }, [
    isMobileLayout,
    sessionScrollPhase,
    shouldStickToBottomRef,
    syncConversationScrollState,
  ]);

  useEffect(() => {
    syncScrollToBottomButton();
  }, [events.length, effectivePendingPermissions.length, pendingUserEvents.length, showPermissionQueue, syncScrollToBottomButton]);

  useEffect(() => {
    if (!isMobileLayout) {
      previousTailLayoutSettlingRef.current = isTailLayoutSettling;
      genericAutoScrollCooldownUntilRef.current = 0;
      return;
    }

    if (previousTailLayoutSettlingRef.current && !isTailLayoutSettling) {
      genericAutoScrollCooldownUntilRef.current = Date.now() + SYSTEM_SCROLL_AUTOSCROLL_COOLDOWN_MS;
    }

    previousTailLayoutSettlingRef.current = isTailLayoutSettling;
  }, [isMobileLayout, isTailLayoutSettling]);

  const autoScrollTriggerKey = useMemo(
    () => [
      eventsForChatId ?? '',
      events.length,
      latestVisibleEventId ?? '',
      pendingUserEvents.length,
      effectivePendingPermissions.length,
      isAwaitingReply ? '1' : '0',
      showPermissionQueue ? '1' : '0',
    ].join(':'),
    [
      effectivePendingPermissions.length,
      events.length,
      eventsForChatId,
      isAwaitingReply,
      latestVisibleEventId,
      pendingUserEvents.length,
      showPermissionQueue,
    ],
  );

  useEffect(() => {
    const nextMode = shouldUseManualScrollRestoration({
      activeChatId: activeChatIdResolved,
      isWorkspaceHome,
      isNewChatPlaceholder,
    }) ? 'manual' : 'auto';

    if (window.history.scrollRestoration === nextMode) {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'chat:scrollRestoration:unchanged',
        detail: {
          nextMode,
        },
      });
      return;
    }

    const previousMode = window.history.scrollRestoration;
    window.history.scrollRestoration = nextMode;
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'chat:scrollRestoration:set',
      detail: {
        previousMode,
        nextMode,
      },
    });

    return () => {
      window.history.scrollRestoration = previousMode;
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'chat:scrollRestoration:restore',
        detail: {
          previousMode,
        },
      });
    };
  }, [activeChatIdResolved, isNewChatPlaceholder, isWorkspaceHome]);

  useEffect(() => {
    if (isMobileLayout && Date.now() < genericAutoScrollCooldownUntilRef.current) {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'chat:auto-scroll-effect:suppressed',
        detail: {
          cooldownUntil: genericAutoScrollCooldownUntilRef.current,
          now: Date.now(),
        },
      });
      return;
    }

    if (!shouldAutoScrollToBottom({
      isWorkspaceHome,
      shouldStickToBottom: shouldStickToBottomRef.current,
      isTailRestorePending: isChatEntryTailRestorePending,
      scrollPhase: sessionScrollPhase,
    })) {
      return;
    }
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'chat:auto-scroll-effect:immediate',
      detail: {
        autoScrollTriggerKey,
        eventsForChatId,
        events: events.length,
        pendingUserEvents: pendingUserEvents.length,
        effectivePendingPermissions: effectivePendingPermissions.length,
        isAwaitingReply,
        isChatEntryTailRestorePending,
        latestVisibleEventId,
      },
    });
    scrollConversationToBottom('auto');

    const rafId = window.requestAnimationFrame(() => {
      if (shouldStickToBottomRef.current) {
        recordScrollDebugEvent({
          kind: 'trigger',
          source: 'chat:auto-scroll-effect:raf',
        });
        scrollConversationToBottom('auto');
      }
    });
    const timeoutId = window.setTimeout(() => {
      if (shouldStickToBottomRef.current) {
        recordScrollDebugEvent({
          kind: 'trigger',
          source: 'chat:auto-scroll-effect:timeout',
        });
        scrollConversationToBottom('auto');
      }
    }, 140);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [
    autoScrollTriggerKey,
    effectivePendingPermissions.length,
    events.length,
    eventsForChatId,
    isAwaitingReply,
    isMobileLayout,
    isWorkspaceHome,
    isChatEntryTailRestorePending,
    latestVisibleEventId,
    pendingUserEvents.length,
    sessionScrollPhase,
    scrollConversationToBottom,
    shouldStickToBottomRef,
  ]);

  useEffect(() => {
    const previousChatId = previousActiveChatIdRef.current;
    previousActiveChatIdRef.current = activeChatIdResolved;

    if (!shouldResetScrollForChatChange({
      previousChatId,
      nextChatId: activeChatIdResolved,
      isNewChatPlaceholder,
      isTailRestorePending: isChatEntryTailRestorePending,
    })) {
      return;
    }

    if (!shouldAllowSystemScrollWrite({
      writer: 'auto-scroll',
      scrollPhase: sessionScrollPhase,
    })) {
      recordScrollDebugEvent({
        kind: 'trigger',
        source: 'chat:chat-change-reset:suppressed',
        detail: {
          previousChatId,
          activeChatIdResolved,
          sessionScrollPhase,
        },
      });
      return;
    }

    shouldStickToBottomRef.current = true;
    setShowScrollToBottom(false);
    recordScrollDebugEvent({
      kind: 'trigger',
      source: 'chat:chat-change-reset:immediate',
      detail: {
        previousChatId,
        activeChatIdResolved,
        isChatEntryTailRestorePending,
      },
    });
    scrollConversationToBottom('auto');

    const rafId = window.requestAnimationFrame(() => {
      if (shouldStickToBottomRef.current) {
        recordScrollDebugEvent({
          kind: 'trigger',
          source: 'chat:chat-change-reset:raf',
        });
        scrollConversationToBottom('auto');
      }
    });
    const timeoutId = window.setTimeout(() => {
      if (shouldStickToBottomRef.current) {
        recordScrollDebugEvent({
          kind: 'trigger',
          source: 'chat:chat-change-reset:timeout',
        });
        scrollConversationToBottom('auto');
      }
    }, 140);

    return () => {
      window.cancelAnimationFrame(rafId);
      window.clearTimeout(timeoutId);
    };
  }, [
    activeChatIdResolved,
    isChatEntryTailRestorePending,
    isNewChatPlaceholder,
    sessionScrollPhase,
    scrollConversationToBottom,
    setShowScrollToBottom,
    shouldStickToBottomRef,
  ]);

  const hasAgentEventSince = useCallback((since: string | null): boolean => {
    if (!since) {
      return false;
    }
    const sinceEpoch = Date.parse(since);
    return events.some((event) => {
      if (isUserEvent(event)) {
        return false;
      }

      const eventEpoch = Date.parse(event.timestamp);
      if (!Number.isFinite(sinceEpoch) || !Number.isFinite(eventEpoch)) {
        return true;
      }
      return eventEpoch >= sinceEpoch;
    });
  }, [events]);

  useEffect(() => {
    if (!isAwaitingReply) {
      return;
    }
    if (runtimeRunning) {
      runtimeStartedSinceAwaitingRef.current = true;
    }
  }, [isAwaitingReply, runtimeRunning]);

  useEffect(() => {
    if (!awaitingReplySince) {
      return;
    }
    if (!latestCompletionSignalSinceAwaiting) {
      return;
    }

    updateActiveChatRuntimeUi({ hasCompletionSignal: true });
    if (runtimeRunning || !completionSignalIsFresh) {
      return;
    }

    updateActiveChatRuntimeUi({
      isAwaitingReply: false,
      awaitingReplySince: null,
      submitError: null,
      showDisconnectRetry: false,
    });
    disconnectNoticeAwaitingRef.current = null;
    runtimeStartedSinceAwaitingRef.current = false;
  }, [
    awaitingReplySince,
    completionSignalIsFresh,
    latestCompletionSignalSinceAwaiting,
    runtimeRunning,
    updateActiveChatRuntimeUi,
  ]);

  useEffect(() => {
    if (!isAwaitingReply || !awaitingReplySince || isRunActive) {
      return;
    }
    const latestAgentEventAt = latestAgentEventSinceAwaiting;
    if (!latestAgentEventAt) {
      return;
    }

    const latestAgentEventEpoch = Date.parse(latestAgentEventAt);
    const settleDeadline = (Number.isFinite(latestAgentEventEpoch) ? latestAgentEventEpoch : Date.now())
      + AGENT_ACTIVITY_SETTLE_MS;
    const remaining = Math.max(0, settleDeadline - Date.now());

    const finalizeAwaitingReply = () => {
      if (runtimeRunning || (latestCompletionSignalSinceAwaiting && completionSignalIsFresh)) {
        return;
      }
      const freshestAgentEventAt = getLatestAgentEventTimestampSince(events, awaitingReplySince);
      if (freshestAgentEventAt && freshestAgentEventAt !== latestAgentEventAt) {
        return;
      }
      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      setSubmitError(null);
      setShowDisconnectRetry(false);
      disconnectNoticeAwaitingRef.current = null;
      runtimeStartedSinceAwaitingRef.current = false;
    };

    if (remaining <= 0) {
      finalizeAwaitingReply();
      return;
    }

    const timer = window.setTimeout(() => {
      finalizeAwaitingReply();
    }, remaining);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    awaitingReplySince,
    completionSignalIsFresh,
    events,
    isAwaitingReply,
    isRunActive,
    latestAgentEventSinceAwaiting,
    latestCompletionSignalSinceAwaiting,
    runtimeRunning,
    setAwaitingReplySince,
    setIsAwaitingReply,
    setShowDisconnectRetry,
    setSubmitError,
  ]);

  useEffect(() => {
    if (!isAwaitingReply || !awaitingReplySince || isRunActive) {
      return;
    }
    if (!runtimeStartedSinceAwaitingRef.current) {
      return;
    }

    const timer = window.setTimeout(() => {
      if (disconnectNoticeAwaitingRef.current === awaitingReplySince) {
        return;
      }
      if (hasAgentEventSince(awaitingReplySince)) {
        return;
      }

      const now = new Date().toISOString();
      disconnectNoticeAwaitingRef.current = awaitingReplySince;
      setShowDisconnectRetry(true);
      setSubmitError('에이전트 연결 중단됨');
      setIsAwaitingReply(false);
      setAwaitingReplySince(null);
      runtimeStartedSinceAwaitingRef.current = false;
      addEvent({
        id: `runtime-disconnected-${now}`,
        timestamp: now,
        kind: 'unknown',
        title: 'Runtime Notice',
        body: '에이전트 연결이 중단되었습니다. 아래 버튼으로 다시 시도할 수 있습니다.',
        meta: {
          role: 'agent',
          system: true,
          streamEvent: 'runtime_disconnected',
        },
        severity: 'warning',
      });
    }, RUNTIME_DISCONNECT_GRACE_MS);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    addEvent,
    awaitingReplySince,
    hasAgentEventSince,
    isAwaitingReply,
    isRunActive,
    setAwaitingReplySince,
    setIsAwaitingReply,
    setShowDisconnectRetry,
    setSubmitError,
  ]);

  useEffect(() => {
    if (!isAwaitingReply || !awaitingReplySince) {
      return;
    }
    if (!runtimeStartedSinceAwaitingRef.current) {
      return;
    }
    if (!syncError && !runtimeError) {
      return;
    }
    if (hasAgentEventSince(awaitingReplySince)) {
      return;
    }

    const now = new Date().toISOString();
    disconnectNoticeAwaitingRef.current = awaitingReplySince;
    setShowDisconnectRetry(true);
    setSubmitError('백엔드 재시작으로 실행이 중단되었습니다. 다시 시도해 주세요.');
    setIsAwaitingReply(false);
    setAwaitingReplySince(null);
    runtimeStartedSinceAwaitingRef.current = false;
    addEvent({
      id: `runtime-restarted-${now}`,
      timestamp: now,
      kind: 'unknown',
      title: 'Runtime Restarted',
      body: '백엔드 재시작 또는 배포로 현재 실행이 중단되었습니다. 같은 프롬프트를 다시 보내 이어서 진행할 수 있습니다.',
      meta: {
        role: 'agent',
        system: true,
        streamEvent: 'runtime_restarted',
      },
      severity: 'warning',
    });
  }, [
    addEvent,
    awaitingReplySince,
    hasAgentEventSince,
    isAwaitingReply,
    runtimeError,
    setAwaitingReplySince,
    setIsAwaitingReply,
    setShowDisconnectRetry,
    setSubmitError,
    syncError,
  ]);

  useEffect(() => {
    if (!isAwaitingReply || !awaitingReplySince) {
      return;
    }
    if (isRunActive || hasAgentEventSince(awaitingReplySince)) {
      return;
    }

    const sinceEpoch = Date.parse(awaitingReplySince);
    const deadline = (Number.isFinite(sinceEpoch) ? sinceEpoch : Date.now()) + AGENT_REPLY_TIMEOUT_MS;
    const remaining = Math.max(0, deadline - Date.now());

    const timer = window.setTimeout(() => {
      if (isRunActive || hasAgentEventSince(awaitingReplySince)) {
        return;
      }
      setIsAwaitingReply(false);
      runtimeStartedSinceAwaitingRef.current = false;
      setSubmitError('에이전트 응답이 지연되고 있습니다. 런타임 연결 상태를 확인해 주세요.');
    }, remaining);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    awaitingReplySince,
    hasAgentEventSince,
    isAwaitingReply,
    isRunActive,
    setIsAwaitingReply,
    setSubmitError,
  ]);

  useEffect(() => {
    if (!activeChatIdResolved) {
      return;
    }
    if (eventsForChatId !== activeChatIdResolved) {
      return;
    }
    const latestThreadId = [...events]
      .reverse()
      .map((event) => (typeof event.meta?.threadId === 'string' ? event.meta.threadId.trim() : ''))
      .find((value) => value.length > 0);
    if (!latestThreadId || latestThreadId === activeChat?.threadId) {
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(
          `/api/runtime/sessions/${encodeURIComponent(sessionId)}/chats/${encodeURIComponent(activeChatIdResolved)}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ threadId: latestThreadId }),
          },
        );
        if (!response.ok || cancelled) {
          return;
        }
        setChats((prev) => sortSessionChats(prev.map((chat) => (
          chat.id === activeChatIdResolved ? { ...chat, threadId: latestThreadId } : chat
        ))));
      } catch {
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [activeChat?.threadId, activeChatIdResolved, events, eventsForChatId, sessionId, setChats]);

  const handleSidebarMarkAsRead = useCallback((chat: SessionChat) => {
    handleMarkChatAsRead(chat);
    closeSidebarMenu();
  }, [closeSidebarMenu, handleMarkChatAsRead]);

  const handleSidebarTogglePin = useCallback((chat: SessionChat) => {
    void handleToggleChatPin(chat);
  }, [handleToggleChatPin]);

  const handleSidebarDeleteChat = useCallback((chat: SessionChat) => {
    void handleDeleteChat(chat);
  }, [handleDeleteChat]);

  const handleSidebarPermissionChoice = useCallback((chatId: string, decision: 'allow_once' | 'allow_session' | 'deny') => {
    void handleSidebarPermissionDecision(chatId, decision);
  }, [handleSidebarPermissionDecision]);

  function handleRunChatCommand(commandId: ChatCommandId) {
    setIsCommandMenuOpen(false);
    if (commandId === 'usage' && (activeAgentFlavor === 'codex' || activeAgentFlavor === 'claude')) {
      setUsageProbeProvider(activeAgentFlavor);
    }
  }

  function handleStreamScroll() {
    syncConversationScrollState();
    syncLastUserMessageJumpTarget();
    const stream = scrollRef.current;
    if (!stream) {
      return;
    }
    if (shouldRecoverDetachedTailOnScroll({
      hasDetachedTail,
      isNearBottom: isNearBottom(stream),
      isLoadingOlder,
      isTailRestorePending: isChatEntryTailRestorePending,
    })) {
      handleJumpToBottom();
    }
  }

  const handleMoveWorkspacePage = useCallback((direction: 'previous' | 'next') => {
    setActiveWorkspacePageId((current) => moveWorkspacePager(workspacePagerItems, current, direction));
  }, [setActiveWorkspacePageId, workspacePagerItems]);

  const handleCreateWorkspacePanel = useCallback(async (type: 'preview' | 'explorer' | 'terminal' | 'bookmark') => {
    try {
      await createWorkspacePanel(type);
    } catch {
      // The create page renders the shared error banner via workspacePanelsError.
    }
  }, [createWorkspacePanel]);

  const sidebarSectionViews = useChatSidebarSectionViews({
    activeChatIdResolved,
    approvalFeedbackByChat,
    chatActionMenuId,
    chatActionMenuRect,
    chatMutationLoadingId,
    chatRuntimeUiByChat,
    chatSidebarSnapshots,
    chatTitleDraft,
    effectivePendingPermissionCount: effectivePendingPermissions.length,
    loadingPermissionId,
    renamingChatId,
    resolveChatPreviewText,
    resolveChatSidebarState,
    resolveSidebarChatRunPhase,
    sidebarApprovalLoadingChatId,
    sidebarSections,
    onDeleteChat: handleSidebarDeleteChat,
    onGoToChat: goToChat,
    onMarkChatAsRead: handleSidebarMarkAsRead,
    onPermissionDecision: handleSidebarPermissionChoice,
    onRenameCancel: handleSidebarRenameCancel,
    onRenameSubmit: handleSidebarRenameSubmit,
    onStartRename: handleSidebarStartRename,
    onTitleDraftChange: handleSidebarTitleDraftChange,
    onToggleChatMenu: handleSidebarChatMenuToggle,
    onToggleChatPin: handleSidebarTogglePin,
  });

  const activeModel = activeComposerModels.find((m) => m.id === activeModelId)
    ?? { id: activeModelId, shortLabel: activeModelId, badge: '커스텀' };

  return (
    <>
    <div
      className={`${styles.chatShell} ${
        isChatSidebarOpen ? styles.chatShellSidebarOpen : styles.chatShellSidebarClosed
      } ${isMobileLayout ? styles.chatShellMobileScroll : ''} ${
        isLeftSidebarOverlayLayout ? styles.chatShellLeftOverlay : ''
      }`}
      ref={chatShellRef}
    >
      <ChatSidebarPane
        sessionTitle={sessionTitle}
        chatCount={chats.length}
        chatMutationError={chatMutationError}
        isWorkspaceHome={isWorkspaceHome}
        isCreatingChat={isCreatingChat}
        isChatSidebarOpen={isChatSidebarOpen}
        isMobileLayout={isMobileLayout}
        isLeftSidebarOverlayLayout={isLeftSidebarOverlayLayout}
        isMounted={isMounted}
        hasMoreChats={hasMoreChats}
        sections={sidebarSectionViews}
        sidebarRef={chatSidebarRef}
        chatListRef={chatListRef}
        chatListSentinelRef={chatListSentinelRef}
        actionMenuRef={chatActionMenuRef}
        onCloseSidebar={() => setIsChatSidebarOpen(false)}
        onGoHome={handleGoHome}
        onCreateChat={handleOpenNewChat}
        RelativeTimeComponent={RelativeTime}
        ElapsedTimerComponent={ElapsedTimer}
      />

      <WorkspacePagerShell
        centerPanelRef={centerPanelRef}
        isMobileLayout={isMobileLayout}
        workspacePagerItems={workspacePagerItems}
        activeWorkspacePageId={activeWorkspacePageId}
        setActiveWorkspacePageId={setActiveWorkspacePageId}
        renderChatPage={() => (
          <ChatCenterPane
            isMobileLayout={isMobileLayout}
            activeChatIdResolved={activeChatIdResolved}
            isWorkspaceHome={isWorkspaceHome}
            isNewChatPlaceholder={isNewChatPlaceholder}
            showChatTransitionLoading={showChatTransitionLoading}
            showScrollToBottom={showScrollToBottom}
            onJumpToBottom={handleJumpToBottom}
            header={(
              <ChatHeader
                activeChatIdResolved={activeChatIdResolved}
                activeWorkspacePageId={activeWorkspacePageId}
                agentMeta={agentMeta}
                agentAvatarToneClass={getAgentAvatarToneClass(agentMeta.tone)}
                approvalPolicy={approvalPolicy}
                chatIdCopyState={chatIdCopyState}
                centerHeaderRef={centerHeaderRef}
                connectionLabel={connectionLabel}
                connectionState={connectionState}
                contextMenuRef={contextMenuRef}
                currentChatTitle={currentChatTitle}
                displayName={displayName}
                effectivePendingPermissionCount={effectivePendingPermissions.length}
                handleAbortRun={handleAbortRun}
                handleCopyChatId={handleCopyChatId}
                handleCopyChatThreadIdsJson={handleCopyChatThreadIdsJson}
                handleMoveWorkspacePage={handleMoveWorkspacePage}
                idBundleCopyState={idBundleCopyState}
                isAborting={isAborting}
                isAgentRunning={isAgentRunning}
                isChatSidebarOpen={isChatSidebarOpen}
                isContextMenuOpen={isContextMenuOpen}
                isDebugMode={isDebugMode}
                isMobileLayout={isMobileLayout}
                isOperator={isOperator}
                isPolicyChanging={isPolicyChanging}
                jumpToPendingPermission={jumpToPendingPermission}
                onToggleChatSidebar={handleToggleChatSidebar}
                onToggleContextMenu={handleToggleContextMenu}
                onToggleDebugMode={toggleDebugMode}
                onTogglePermissionQueue={handleTogglePermissionQueue}
                onUpdateApprovalPolicy={handleUpdateApprovalPolicy}
                sessionTitle={sessionTitle}
                showDebugToggleInHeader={showDebugToggleInHeader}
                showPermissionQueue={showPermissionQueue}
              />
            )}
            statusNotices={(
              <ChatStatusNotices
                runtimeNotice={runtimeNotice}
                showDisconnectRetry={showDisconnectRetry}
                onRetryDisconnected={handleRetryDisconnected}
                isRetryDisabled={!isOperator || isAgentRunning || isSubmitting || !lastSubmittedPayload}
                isSubmitting={isSubmitting}
                effectivePendingPermissionCount={effectivePendingPermissions.length}
                pendingPermissionsCount={pendingPermissions.length}
                onJumpToPendingPermission={jumpToPendingPermission}
              />
            )}
            jumpBar={showLastUserMessageJumpBar ? (
              <LastUserMessageJumpBar
                preview={lastUserMessageJumpTarget?.preview ?? ''}
                showPendingReveal={showChatTransitionLoading}
                onJump={handleLastUserMessageJump}
              />
            ) : null}
            chatBody={isWorkspaceHome ? (
              <WorkspaceHomePane
                sessionId={sessionId}
                sessionTitle={sessionTitle}
                projectPath={projectName}
                agentFlavor={agentFlavor}
                chats={chats}
                isMobileLayout={isMobileLayout}
                chatEntryPendingRevealClassName={chatEntryPendingRevealClassName}
                showChatTransitionLoading={showChatTransitionLoading}
                scrollRef={scrollRef}
                onStreamScroll={handleStreamScroll}
                onSelectChat={handleSelectWorkspaceChat}
                onNewChat={handleOpenNewChat}
                onBack={handleBackFromWorkspaceHome}
              />
            ) : isNewChatPlaceholder ? (
              <NewChatPlaceholderPane
                isMobileLayout={isMobileLayout}
                chatEntryPendingRevealClassName={chatEntryPendingRevealClassName}
                showChatTransitionLoading={showChatTransitionLoading}
                scrollRef={scrollRef}
                onStreamScroll={handleStreamScroll}
                onBack={handleReturnToWorkspaceHome}
                onCreateChat={handleCreateChat}
              />
            ) : (
              <ChatTimeline
                activeAgentFlavor={activeAgentFlavor}
                activeChat={activeChat}
                agentMeta={agentMeta}
                chatEntryPendingRevealClassName={chatEntryPendingRevealClassName}
                copiedUserEventId={copiedUserEventId}
                expandedResultIds={expandedResultIds}
                hasMoreBefore={hasMoreBefore}
                highlightedEventId={highlightedEventId}
                isAgentRunning={isAgentRunning}
                isDebugMode={isDebugMode}
                isLoadingOlder={isLoadingOlder}
                isLoadOlderDisabled={shouldBlockLoadOlder({
                  isTailLayoutSettling,
                  isLoadingOlder,
                  hasMoreBefore,
                  scrollPhase: sessionScrollPhase,
                })}
                isMobileLayout={isMobileLayout}
                isOperator={isOperator}
                loadingPermissionId={loadingPermissionId}
                onLoadOlder={handleLoadOlderButtonClick}
                scrollRef={scrollRef}
                showChatTransitionLoading={showChatTransitionLoading}
                timelineItems={timelineItems}
                onCopyUserMessage={handleCopyUserMessage}
                onDecidePermission={(permissionId, decision) => {
                  void decidePermission(permissionId, decision);
                }}
                onDeleteEmptyAutoChat={handleDeleteEmptyAutoChat}
                onUserMessageBubbleRef={setUserMessageBubbleNode}
                onSelectQuickStart={handleSelectQuickStart}
                onStreamScroll={handleStreamScroll}
                onToggleActionRun={toggleActionRun}
                onToggleResult={toggleResult}
              />
            )}
            composer={!isWorkspaceHome ? (
              <ChatComposer
                showPendingReveal={showChatTransitionLoading}
                agentFlavor={activeAgentFlavor}
                AgentIcon={agentMeta.Icon}
                activeModelShortLabel={activeModel.shortLabel}
                activeChatIdResolved={activeChatIdResolved}
                isOperator={isOperator}
                isAgentRunning={isAgentRunning}
                isAborting={isAborting}
                prompt={prompt}
                contextItems={contextItems}
                imageUploadsInFlight={imageUploadsInFlight}
                imageUploadError={imageUploadError}
                availableChatCommands={availableChatCommands}
                isCommandMenuOpen={isCommandMenuOpen}
                isModelDropdownOpen={isModelDropdownOpen}
                isGeminiModeDropdownOpen={isGeminiModeDropdownOpen}
                activeComposerModels={activeComposerModels}
                activeModelId={activeModelId}
                activeGeminiMode={activeGeminiMode}
                activeGeminiModeId={activeGeminiModeId}
                activeGeminiModeOptions={activeGeminiModeOptions}
                approvalPolicy={approvalPolicy}
                selectedModelReasoningEffort={selectedModelReasoningEffort}
                plusMenuMode={plusMenuMode}
                textContextInput={textContextInput}
                commandMenuRef={commandMenuRef}
                modelDropdownRef={modelDropdownRef}
                geminiModeDropdownRef={geminiModeDropdownRef}
                plusMenuRef={plusMenuRef}
                composerDockRef={composerDockRef}
                composerInputRef={composerInputRef}
                composerImageInputRef={composerImageInputRef}
                onSubmit={handleSubmit}
                onToggleCommandMenu={handleToggleCommandMenu}
                onRunChatCommand={handleRunChatCommand}
                onToggleModelDropdown={handleToggleModelDropdown}
                onSelectModel={handleModelSelect}
                onToggleGeminiModeDropdown={handleToggleGeminiModeDropdown}
                onSelectGeminiMode={handleGeminiModeSelect}
                onSelectModelReasoningEffort={handleModelReasoningEffortSelect}
                onRemoveContextItem={removeContextItem}
                onImageSelection={handleComposerImageSelection}
                onTogglePlusMenu={handleTogglePlusMenu}
                onImageUploadOpen={handleImageUploadOpen}
                onFileBrowserOpen={handleFileBrowserOpen}
                onOpenTextContextEditor={handleOpenTextContextEditor}
                onTextContextInputChange={setTextContextInput}
                onCancelTextContext={handleCancelTextContext}
                onAddTextContext={handleAddTextContext}
                onPromptChange={setPrompt}
                onPromptInput={resizeComposerInput}
                onPromptFocus={handleComposerFocus}
                onPromptKeyDown={handlePromptKeyDown}
                onAbortRun={handleAbortRun}
              />
            ) : null}
            transitionOverlay={showChatTransitionLoading ? (
              <div
                className={styles.chatTransitionOverlay}
                role="status"
                aria-live="polite"
                aria-busy="true"
                style={{ '--chat-transition-accent': `var(--agent-${activeAgentFlavor}-accent)` } as CSSProperties}
              >
                <div className={styles.chatTransitionOrb}>
                  <span className={styles.chatTransitionSpinner} aria-hidden="true" />
                  <div className={styles.chatTransitionLogo}>
                    <agentMeta.Icon size={34} />
                  </div>
                </div>
                <div className={styles.chatTransitionMessage}>에이전트 채팅 로딩중…</div>
              </div>
            ) : null}
          />
        )}
        renderCreatePage={() => (
          <WorkspacePanelsPane
            mode="create"
            sessionId={sessionId}
            projectName={projectName}
            workspaceRootPath={normalizedWorkspaceRootPath}
            isMobileLayout={isMobileLayout}
            workspacePanelsError={workspacePanelsError}
            workspacePanelsLoading={workspacePanelsLoading}
            workspacePanelLayout={workspacePanelLayout}
            requestedFile={sidebarFileRequest}
            onCreatePanel={handleCreateWorkspacePanel}
            onReturnToChat={() => setActiveWorkspacePageId('chat')}
          />
        )}
        renderPanelPage={(item) => (
          <WorkspacePanelsPane
            mode="panel"
            sessionId={sessionId}
            projectName={projectName}
            workspaceRootPath={normalizedWorkspaceRootPath}
            isMobileLayout={isMobileLayout}
            workspacePanelsError={workspacePanelsError}
            workspacePanelsLoading={workspacePanelsLoading}
            workspacePanelLayout={workspacePanelLayout}
            requestedFile={sidebarFileRequest}
            panelId={item.panelId}
            onSavePanel={saveWorkspacePanel}
            onDeletePanel={deleteWorkspacePanel}
            onReturnToChat={() => setActiveWorkspacePageId('chat')}
          />
        )}
      />
    </div>

    {/* ── 파일 탐색기 모달 ── */}
    {isMounted && plusMenuMode === 'file' && createPortal(
      <FileBrowserModal
        fileBrowserQuery={fileBrowserQuery}
        fileBrowserSearchResults={fileBrowserSearchResults}
        fileBrowserSearchLoading={fileBrowserSearchLoading}
        recentAttachments={recentAttachments}
        fileBrowserParentPath={fileBrowserParentPath}
        fileBrowserPath={fileBrowserPath}
        fileBrowserLoading={fileBrowserLoading}
        fileBrowserError={fileBrowserError}
        fileBrowserItems={fileBrowserItems}
        onClose={() => setPlusMenuMode('closed')}
        onSearchChange={(value) => { void handleFileBrowserSearch(value); }}
        onClearSearch={() => {
          setFileBrowserQuery('');
          setFileBrowserSearchResults(null);
        }}
        onSearchResultSelect={(item) => {
          if (item.isDirectory) {
            setFileBrowserQuery('');
            setFileBrowserSearchResults(null);
            void fetchFileBrowserDir(item.path);
            return;
          }
          void handleFileBrowserSelect(item.path);
        }}
        onBrowseParent={() => { void fetchFileBrowserDir(fileBrowserParentPath!); }}
        onBrowseItem={(item) => {
          if (item.isDirectory) {
            void fetchFileBrowserDir(item.path);
            return;
          }
          void handleFileBrowserSelect(item.path);
        }}
        onRecentAttachmentSelect={(path) => { void handleFileBrowserSelect(path); }}
      />,
      document.body
    )}
    {isMounted && usageProbeProvider && createPortal(
      <UsageProbeModal
        provider={usageProbeProvider}
        commandId="usage"
        workspacePath={normalizedWorkspaceRootPath}
        onClose={() => setUsageProbeProvider(null)}
      />,
      document.body,
    )}
    </>
  );
}
