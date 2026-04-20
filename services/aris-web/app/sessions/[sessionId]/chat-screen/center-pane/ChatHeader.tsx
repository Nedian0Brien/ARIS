'use client';

import type { RefObject } from 'react';
import {
  Activity,
  Bug,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  MoreVertical,
  PanelLeftClose,
  PanelLeftOpen,
} from 'lucide-react';
import type { ApprovalPolicy } from '@/lib/happy/types';
import type { AgentMeta } from '../types';
import { approvalPolicyLabel } from '../helpers';
import styles from '../../ChatInterface.module.css';

type ChatCopyState = 'idle' | 'copied' | 'failed';
type ChatConnectionState = 'running' | 'connected' | 'degraded';

type ChatHeaderProps = {
  activeChatIdResolved: string | null;
  activeWorkspacePageId: string;
  agentMeta: AgentMeta;
  agentAvatarToneClass: string;
  approvalPolicy: ApprovalPolicy | undefined;
  chatIdCopyState: ChatCopyState;
  centerHeaderRef: RefObject<HTMLElement | null>;
  connectionLabel: string;
  connectionState: ChatConnectionState;
  contextMenuRef: RefObject<HTMLDivElement | null>;
  currentChatTitle: string;
  displayName: string;
  effectivePendingPermissionCount: number;
  handleAbortRun: () => void;
  handleCopyChatId: () => void;
  handleCopyChatThreadIdsJson: () => void;
  handleMoveWorkspacePage: (direction: 'previous' | 'next') => void;
  idBundleCopyState: ChatCopyState;
  isAborting: boolean;
  isAgentRunning: boolean;
  isChatSidebarOpen: boolean;
  isContextMenuOpen: boolean;
  isDebugMode: boolean;
  isMobileLayout: boolean;
  isOperator: boolean;
  isPolicyChanging: boolean;
  onToggleChatSidebar: () => void;
  onToggleContextMenu: () => void;
  onToggleDebugMode: () => void;
  onTogglePermissionQueue: () => void;
  onUpdateApprovalPolicy: (next: ApprovalPolicy) => void;
  sessionTitle: string;
  showDebugToggleInHeader: boolean;
  showPermissionQueue: boolean;
  jumpToPendingPermission: () => void;
};

export function ChatHeader({
  activeChatIdResolved,
  activeWorkspacePageId,
  agentMeta,
  agentAvatarToneClass,
  approvalPolicy,
  chatIdCopyState,
  centerHeaderRef,
  connectionLabel,
  connectionState,
  contextMenuRef,
  currentChatTitle,
  displayName,
  effectivePendingPermissionCount,
  handleAbortRun,
  handleCopyChatId,
  handleCopyChatThreadIdsJson,
  handleMoveWorkspacePage,
  idBundleCopyState,
  isAborting,
  isAgentRunning,
  isChatSidebarOpen,
  isContextMenuOpen,
  isDebugMode,
  isMobileLayout,
  isOperator,
  isPolicyChanging,
  jumpToPendingPermission,
  onToggleChatSidebar,
  onToggleContextMenu,
  onToggleDebugMode,
  onTogglePermissionQueue,
  onUpdateApprovalPolicy,
  sessionTitle,
  showDebugToggleInHeader,
  showPermissionQueue,
}: ChatHeaderProps) {
  return (
    <header className={styles.centerHeader} ref={centerHeaderRef}>
      <button
        type="button"
        className={styles.sidebarToggleButton}
        onClick={onToggleChatSidebar}
        aria-label={isChatSidebarOpen ? '채팅 사이드바 닫기' : '채팅 사이드바 열기'}
        title={isChatSidebarOpen ? '채팅 사이드바 닫기' : '채팅 사이드바 열기'}
      >
        {isChatSidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
      </button>
      <span className={`${styles.agentAvatarHero} ${agentAvatarToneClass}`}>
        <agentMeta.Icon size={20} />
      </span>
      <div className={styles.centerHeaderInfo}>
        <h2 className={styles.centerTitle}>{isMobileLayout ? sessionTitle : displayName}</h2>
        {isMobileLayout ? (
          <div className={styles.centerMetaRow}>
            <span className={styles.centerAgentLabel}>{agentMeta.label}</span>
            <span className={styles.centerChatLabel}>{currentChatTitle}</span>
          </div>
        ) : (
          <span className={styles.centerAgentLabel}>{agentMeta.label} Agent · {sessionTitle}</span>
        )}
      </div>
      <div className={styles.centerHeaderActions}>
        <button
          type="button"
          className={styles.sidebarToggleButton}
          onClick={() => handleMoveWorkspacePage('previous')}
          aria-label="이전 작업 화면으로 이동"
          title="이전 작업 화면으로 이동"
          disabled={activeWorkspacePageId === 'chat'}
        >
          <ChevronLeft size={15} />
        </button>
        <button
          type="button"
          className={styles.sidebarToggleButton}
          onClick={() => handleMoveWorkspacePage('next')}
          aria-label="다음 작업 화면으로 이동"
          title="다음 작업 화면으로 이동"
        >
          <ChevronRight size={15} />
        </button>
        {showDebugToggleInHeader && (
          <button
            type="button"
            className={`${styles.debugToggleButton} ${isDebugMode ? styles.debugToggleButtonActive : ''}`}
            onClick={onToggleDebugMode}
            aria-pressed={isDebugMode}
            aria-label={isDebugMode ? '디버그 모드 끄기' : '디버그 모드 켜기'}
            title={isDebugMode ? '디버그 모드 끄기' : '디버그 모드 켜기'}
          >
            <Bug size={14} />
            <span>디버그</span>
          </button>
        )}
        <span
          className={`${styles.connectionPill} ${
            connectionState === 'running'
              ? styles.connectionRunning
              : connectionState === 'connected'
                ? styles.connectionGood
                : styles.connectionWarn
          }`}
        >
          {connectionState === 'running' ? (
            <Activity size={13} className={styles.connectionRunningIcon} />
          ) : connectionState === 'connected' ? (
            <CheckCircle2 size={13} />
          ) : (
            <CircleAlert size={13} />
          )}
          {connectionLabel}
        </span>
        <div className={styles.contextMenuWrap} ref={contextMenuRef}>
          <button
            type="button"
            className={styles.contextMenuButton}
            aria-label="워크스페이스 컨텍스트 메뉴"
            onClick={onToggleContextMenu}
          >
            <MoreVertical size={16} />
          </button>
          {isContextMenuOpen && (
            <div className={styles.contextMenuPanel} role="menu">
              <div className={styles.contextMenuMeta}>
                <span>Pending: {effectivePendingPermissionCount}</span>
              </div>
              {isOperator && (
                <div className={styles.contextMenuPolicyRow}>
                  <label htmlFor="approval-policy-select" className={styles.contextMenuPolicyLabel}>
                    Policy
                  </label>
                  <select
                    id="approval-policy-select"
                    className={styles.contextMenuPolicySelect}
                    value={approvalPolicy ?? 'on-request'}
                    disabled={isPolicyChanging}
                    onChange={(e) => onUpdateApprovalPolicy(e.target.value as ApprovalPolicy)}
                  >
                    <option value="on-request">ON REQUEST</option>
                    <option value="on-failure">ON FAILURE</option>
                    <option value="never">NEVER</option>
                    <option value="yolo">YOLO</option>
                  </select>
                </div>
              )}
              {!isOperator && (
                <div className={styles.contextMenuMeta}>
                  <span>Policy: {approvalPolicyLabel(approvalPolicy)}</span>
                </div>
              )}
              <button
                type="button"
                className={styles.contextMenuItem}
                disabled={!activeChatIdResolved}
                onClick={handleCopyChatId}
              >
                {chatIdCopyState === 'copied'
                  ? '현재 채팅 ID 복사됨'
                  : chatIdCopyState === 'failed'
                    ? '채팅 ID 복사 실패 (다시 시도)'
                    : '현재 채팅 ID 복사'}
              </button>
              <button
                type="button"
                className={styles.contextMenuItem}
                disabled={!activeChatIdResolved}
                onClick={handleCopyChatThreadIdsJson}
              >
                {idBundleCopyState === 'copied'
                  ? '채팅/스레드 ID JSON 복사됨'
                  : idBundleCopyState === 'failed'
                    ? 'JSON 복사 실패 (다시 시도)'
                    : '채팅/스레드 ID JSON 복사'}
              </button>
              <button
                type="button"
                className={styles.contextMenuItem}
                onClick={() => {
                  onToggleContextMenu();
                  handleAbortRun();
                }}
                disabled={!isOperator || !isAgentRunning || isAborting}
              >
                {isAborting ? '중단 중...' : '에이전트 실행 중단'}
              </button>
              <button
                type="button"
                className={styles.contextMenuItem}
                onClick={() => {
                  onToggleContextMenu();
                  jumpToPendingPermission();
                }}
                disabled={effectivePendingPermissionCount === 0}
              >
                대기 승인 바로 이동
              </button>
              {!showDebugToggleInHeader && (
                <button
                  type="button"
                  className={`${styles.contextMenuItem} ${isDebugMode ? styles.contextMenuItemActive : ''}`}
                  onClick={() => {
                    onToggleContextMenu();
                    onToggleDebugMode();
                  }}
                >
                  {isDebugMode ? '디버그 모드 끄기' : '디버그 모드 켜기'}
                </button>
              )}
              <button
                type="button"
                className={styles.contextMenuItem}
                onClick={onTogglePermissionQueue}
              >
                권한 요청 {showPermissionQueue ? '숨기기' : '표시하기'}
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
