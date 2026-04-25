'use client';

import React from 'react';
import type { ComponentType, KeyboardEvent, MouseEventHandler, RefObject } from 'react';
import { CornerDownRight, MoreVertical, Pin } from 'lucide-react';
import type { ChatApprovalFeedback } from '../types';
import styles from '../../ChatInterface.module.css';
import { ChatSidebarActionMenu } from './ChatSidebarActionMenu';

export type SidebarPermissionDecision = 'allow_once' | 'allow_session' | 'deny';

export type ChatSidebarItemViewModel = {
  id: string;
  title: string;
  isPinned: boolean;
  isActive: boolean;
  isRenaming: boolean;
  timestamp: string;
  sidebarStateClassName: string;
  agentAvatarToneClassName: string;
  AgentIcon: ComponentType<{ size?: number; className?: string }>;
  previewText: string;
  runPhaseLabel: string | null;
  runPhaseBadgeClassName: string;
  runStartedAt: string | null;
  approvalFeedback: ChatApprovalFeedback | null;
  hasPendingApproval: boolean;
  showApprovalPanel: boolean;
  approvalBusy: boolean;
  isMenuOpen: boolean;
  menuRect: DOMRect | null;
  canMarkAsRead: boolean;
  chatTitleDraft: string;
  mutationBusy: boolean;
  onSelect: () => void;
  onMenuToggle: MouseEventHandler<HTMLButtonElement>;
  onTitleDraftChange: (value: string) => void;
  onRenameSubmit: () => void;
  onRenameBlur: () => void;
  onRenameCancel: () => void;
  onMarkAsRead: () => void;
  onStartRename: () => void;
  onTogglePin: () => void;
  onDelete: () => void;
  onPermissionDecision: (decision: SidebarPermissionDecision) => void;
};

function handleRenameInputKeyDown(
  event: KeyboardEvent<HTMLInputElement>,
  item: ChatSidebarItemViewModel,
) {
  if (event.key === 'Enter') {
    event.preventDefault();
    item.onRenameSubmit();
    return;
  }
  if (event.key === 'Escape') {
    item.onRenameCancel();
  }
}

export function ChatSidebarItem({
  item,
  isMounted,
  actionMenuRef,
  RelativeTimeComponent,
  ElapsedTimerComponent,
}: {
  item: ChatSidebarItemViewModel;
  isMounted: boolean;
  actionMenuRef: RefObject<HTMLDivElement | null>;
  RelativeTimeComponent: ComponentType<{ timestamp: string; className?: string }>;
  ElapsedTimerComponent: ComponentType<{ since: string; className?: string }>;
}) {
  const statusLabel = item.runPhaseLabel ?? (item.hasPendingApproval ? 'Needs approval' : 'Idle');

  return (
    <div
      className={`${styles.chatListItem} ${item.isActive ? styles.chatListItemActive : ''} ${item.sidebarStateClassName}`}
    >
      <div className={styles.chatListItemTopRow}>
        <button
          type="button"
          className={styles.chatListMainButton}
          onClick={item.onSelect}
          title={item.title}
        >
          <span className={styles.chatListMainContent}>
            <span className={styles.chatListTitleWrap}>
              <span className={`${styles.chatListAgentAvatar} ${item.agentAvatarToneClassName}`}>
                <item.AgentIcon size={13} />
              </span>
              {item.isPinned && <Pin size={12} className={styles.chatListPinIcon} />}
              {item.isRenaming ? (
                <input
                  value={item.chatTitleDraft}
                  onChange={(event) => item.onTitleDraftChange(event.target.value)}
                  onClick={(event) => event.stopPropagation()}
                  onKeyDown={(event) => handleRenameInputKeyDown(event, item)}
                  onBlur={item.onRenameBlur}
                  className={styles.chatListRenameInput}
                  autoFocus
                />
              ) : (
                <span className={styles.chatListTitle}>{item.title}</span>
              )}
            </span>
            {!item.isRenaming && (
              <span className={styles.chatListPreviewRow}>
                <CornerDownRight size={12} className={styles.chatListPreviewIcon} />
                {item.runPhaseLabel && (
                  <span className={`${styles.chatListRunPhaseBadge} ${item.runPhaseBadgeClassName}`}>
                    {item.runPhaseLabel}
                    {item.runStartedAt && (
                      <ElapsedTimerComponent since={item.runStartedAt} className={styles.chatListRunPhaseElapsed} />
                    )}
                  </span>
                )}
                <span className={styles.chatListPreviewText}>{item.previewText}</span>
              </span>
            )}
          </span>
          <RelativeTimeComponent timestamp={item.timestamp} className={styles.chatListTime} />
        </button>
        {!item.isRenaming && (
          <div className={styles.chatListMenuWrap}>
            <button
              type="button"
              className={styles.chatListMenuButton}
              onClick={item.onMenuToggle}
              title="채팅 메뉴"
            >
              <MoreVertical size={15} />
            </button>
            <ChatSidebarActionMenu
              isMounted={isMounted}
              isOpen={item.isMenuOpen}
              menuRect={item.menuRect}
              menuRef={actionMenuRef}
              canMarkAsRead={item.canMarkAsRead}
              isPinned={item.isPinned}
              isBusy={item.mutationBusy}
              onMarkAsRead={item.onMarkAsRead}
              onRename={item.onStartRename}
              onTogglePin={item.onTogglePin}
              onDelete={item.onDelete}
            />
          </div>
        )}
      </div>
      <div className={styles.chatListTooltip} role="tooltip" aria-hidden="true">
        <div className={styles.chatListTooltipTitle}>{item.title}</div>
        <div className={styles.chatListTooltipMeta}>
          <span className={`${styles.chatListTooltipStatus} ${item.runPhaseBadgeClassName}`}>
            <span className={styles.chatListTooltipDot} aria-hidden />
            {statusLabel}
          </span>
          <RelativeTimeComponent timestamp={item.timestamp} className={styles.chatListTooltipTime} />
        </div>
        <div className={styles.chatListTooltipLastLabel}>Last user message</div>
        <div className={styles.chatListTooltipLastText}>{item.previewText || '—'}</div>
      </div>
      <div className={`${styles.chatListApprovalWrap} ${item.showApprovalPanel ? styles.chatListApprovalWrapOpen : ''}`}>
        <div className={styles.chatListApprovalInner}>
          {item.approvalFeedback ? (
            <div
              className={`${styles.chatListApprovalResult} ${
                item.approvalFeedback === 'approved'
                  ? styles.chatListApprovalResultApproved
                  : styles.chatListApprovalResultDenied
              }`}
            >
              {item.approvalFeedback === 'approved' ? '승인됨' : '거부됨'}
            </div>
          ) : (
            <div className={styles.chatListApprovalButtons}>
              <button
                type="button"
                className={styles.chatListApprovalButton}
                onClick={() => item.onPermissionDecision('allow_once')}
                disabled={!item.hasPendingApproval || item.approvalBusy}
              >
                {item.approvalBusy ? '처리 중...' : '승인'}
              </button>
              <button
                type="button"
                className={styles.chatListApprovalButton}
                onClick={() => item.onPermissionDecision('allow_session')}
                disabled={!item.hasPendingApproval || item.approvalBusy}
              >
                항상 승인
              </button>
              <button
                type="button"
                className={`${styles.chatListApprovalButton} ${styles.chatListApprovalButtonDeny}`}
                onClick={() => item.onPermissionDecision('deny')}
                disabled={!item.hasPendingApproval || item.approvalBusy}
              >
                거부
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
