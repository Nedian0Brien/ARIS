import { useMemo } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import type { SessionChat } from '@/lib/happy/types';
import { resolveChatReadMarkerId } from '../../chatSidebar';
import { CHAT_RUN_PHASE_LABELS } from '../constants';
import { resolveAgentMeta } from '../helpers';
import type {
  ChatApprovalFeedback,
  ChatRunPhase,
  ChatRuntimeUiState,
  ChatSidebarSection,
  ChatSidebarSnapshot,
  ChatSidebarState,
} from '../types';
import styles from '../../ChatInterface.module.css';
import type { SidebarPermissionDecision } from './ChatSidebarItem';
import type { ChatSidebarSectionViewModel } from './ChatSidebarPane';

function getAgentAvatarToneClass(tone: ReturnType<typeof resolveAgentMeta>['tone']): string {
  const map = {
    clay: styles.agentAvatarClay,
    mint: styles.agentAvatarMint,
    blue: styles.agentAvatarBlue,
  } as const;
  return map[tone] || '';
}

type Params = {
  activeChatIdResolved: string | null;
  approvalFeedbackByChat: Record<string, ChatApprovalFeedback>;
  chatActionMenuId: string | null;
  chatActionMenuRect: DOMRect | null;
  chatMutationLoadingId: string | null;
  chatRuntimeUiByChat: Record<string, ChatRuntimeUiState>;
  chatSidebarSnapshots: Record<string, ChatSidebarSnapshot>;
  chatTitleDraft: string;
  effectivePendingPermissionCount: number;
  loadingPermissionId: string | null;
  renamingChatId: string | null;
  resolveChatPreviewText: (chatId: string) => string;
  resolveChatSidebarState: (chat: SessionChat) => ChatSidebarState;
  resolveSidebarChatRunPhase: (chat: SessionChat) => ChatRunPhase;
  sidebarApprovalLoadingChatId: string | null;
  sidebarSections: ChatSidebarSection[];
  onDeleteChat: (chat: SessionChat) => void;
  onGoToChat: (chatId: string) => void;
  onMarkChatAsRead: (chat: SessionChat) => void;
  onPermissionDecision: (chatId: string, decision: SidebarPermissionDecision) => void;
  onRenameCancel: () => void;
  onRenameSubmit: (chatId: string, nextTitle: string) => void;
  onStartRename: (chat: SessionChat) => void;
  onTitleDraftChange: (value: string) => void;
  onToggleChatMenu: (chatId: string, rect: DOMRect) => void;
  onToggleChatPin: (chat: SessionChat) => void;
};

export function useChatSidebarSectionViews({
  activeChatIdResolved,
  approvalFeedbackByChat,
  chatActionMenuId,
  chatActionMenuRect,
  chatMutationLoadingId,
  chatRuntimeUiByChat,
  chatSidebarSnapshots,
  chatTitleDraft,
  effectivePendingPermissionCount,
  loadingPermissionId,
  renamingChatId,
  resolveChatPreviewText,
  resolveChatSidebarState,
  resolveSidebarChatRunPhase,
  sidebarApprovalLoadingChatId,
  sidebarSections,
  onDeleteChat,
  onGoToChat,
  onMarkChatAsRead,
  onPermissionDecision,
  onRenameCancel,
  onRenameSubmit,
  onStartRename,
  onTitleDraftChange,
  onToggleChatMenu,
  onToggleChatPin,
}: Params): ChatSidebarSectionViewModel[] {
  return useMemo(() => sidebarSections.map((section) => ({
    key: section.key,
    label: section.label,
    totalCount: section.totalCount,
    items: section.chats.map((chat) => {
      const isActive = chat.id === activeChatIdResolved;
      const isRenaming = renamingChatId === chat.id;
      const rowAgentMeta = resolveAgentMeta(chat.agent);
      const RowAgentIcon = rowAgentMeta.Icon;
      const sidebarState = resolveChatSidebarState(chat);
      const sidebarStateClassName = sidebarState === 'running'
        ? styles.chatListItemStateRunning
        : sidebarState === 'completed'
          ? styles.chatListItemStateCompleted
          : sidebarState === 'approval'
            ? styles.chatListItemStateApproval
            : sidebarState === 'error'
              ? styles.chatListItemStateError
              : '';
      const chatPreviewText = resolveChatPreviewText(chat.id);
      const chatRunPhase = resolveSidebarChatRunPhase(chat);
      const chatRunPhaseLabel = chatRunPhase === 'idle' ? null : CHAT_RUN_PHASE_LABELS[chatRunPhase];
      const chatRunStartedAt = (chatRuntimeUiByChat[chat.id]?.awaitingReplySince ?? '').trim() || null;
      const chatRunPhaseBadgeClassName = chatRunPhase === 'aborting'
        ? styles.chatListRunPhaseBadgeAborting
        : chatRunPhase === 'approval'
          ? styles.chatListRunPhaseBadgeApproval
          : chatRunPhase === 'waiting'
            ? styles.chatListRunPhaseBadgeWaiting
            : chatRunPhase === 'running'
              ? styles.chatListRunPhaseBadgeRunning
              : styles.chatListRunPhaseBadgeSubmitting;
      const approvalFeedback = approvalFeedbackByChat[chat.id] ?? null;
      const hasPendingApproval = isActive && effectivePendingPermissionCount > 0;
      const showApprovalPanel = isActive && (
        hasPendingApproval
        || sidebarApprovalLoadingChatId === chat.id
        || Boolean(approvalFeedback)
      );
      const approvalBusy = sidebarApprovalLoadingChatId === chat.id || loadingPermissionId !== null;
      const isMenuOpen = chatActionMenuId === chat.id;

      return {
        id: chat.id,
        title: chat.title,
        isPinned: chat.isPinned,
        isActive,
        isRenaming,
        timestamp: chat.lastActivityAt || chat.createdAt,
        sidebarStateClassName,
        agentAvatarToneClassName: getAgentAvatarToneClass(rowAgentMeta.tone),
        AgentIcon: RowAgentIcon,
        previewText: chatPreviewText,
        runPhaseLabel: chatRunPhaseLabel,
        runPhaseBadgeClassName: chatRunPhaseBadgeClassName,
        runStartedAt: chatRunStartedAt,
        approvalFeedback,
        hasPendingApproval,
        showApprovalPanel,
        approvalBusy,
        isMenuOpen,
        menuRect: isMenuOpen ? chatActionMenuRect : null,
        canMarkAsRead: Boolean(resolveChatReadMarkerId({
          latestEventId: chatSidebarSnapshots[chat.id]?.latestEventId,
          fallbackLatestEventId: chat.latestEventId,
        })),
        chatTitleDraft,
        mutationBusy: chatMutationLoadingId === chat.id,
        onSelect: () => onGoToChat(chat.id),
        onMenuToggle: (event: ReactMouseEvent<HTMLButtonElement>) => {
          event.stopPropagation();
          if (isMenuOpen) {
            onToggleChatMenu(chat.id, chatActionMenuRect ?? event.currentTarget.getBoundingClientRect());
            return;
          }
          onToggleChatMenu(chat.id, event.currentTarget.getBoundingClientRect());
        },
        onTitleDraftChange,
        onRenameSubmit: () => {
          onRenameSubmit(chat.id, chatTitleDraft);
        },
        onRenameBlur: () => {
          if (renamingChatId === chat.id) {
            onRenameSubmit(chat.id, chatTitleDraft);
          }
        },
        onRenameCancel,
        onMarkAsRead: () => {
          onMarkChatAsRead(chat);
        },
        onStartRename: () => {
          onStartRename(chat);
        },
        onTogglePin: () => {
          onToggleChatPin(chat);
        },
        onDelete: () => {
          onDeleteChat(chat);
        },
        onPermissionDecision: (decision: SidebarPermissionDecision) => {
          onPermissionDecision(chat.id, decision);
        },
      };
    }),
  })), [
    activeChatIdResolved,
    approvalFeedbackByChat,
    chatActionMenuId,
    chatActionMenuRect,
    chatMutationLoadingId,
    chatRuntimeUiByChat,
    chatSidebarSnapshots,
    chatTitleDraft,
    effectivePendingPermissionCount,
    loadingPermissionId,
    onDeleteChat,
    onGoToChat,
    onMarkChatAsRead,
    onPermissionDecision,
    onRenameCancel,
    onRenameSubmit,
    onStartRename,
    onTitleDraftChange,
    onToggleChatMenu,
    onToggleChatPin,
    renamingChatId,
    resolveChatPreviewText,
    resolveChatSidebarState,
    resolveSidebarChatRunPhase,
    sidebarApprovalLoadingChatId,
    sidebarSections,
  ]);
}
