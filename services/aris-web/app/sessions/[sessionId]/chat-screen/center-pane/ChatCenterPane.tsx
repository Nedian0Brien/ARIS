'use client';

import React from 'react';
import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import styles from '../../ChatInterface.module.css';

type ChatCenterPaneProps = {
  isMobileLayout: boolean;
  activeChatIdResolved: string | null;
  isWorkspaceHome: boolean;
  isNewChatPlaceholder: boolean;
  showChatTransitionLoading: boolean;
  showScrollToBottom: boolean;
  onJumpToBottom: () => void;
  header: ReactNode;
  statusNotices: ReactNode;
  chatBody: ReactNode;
  composer: ReactNode;
  transitionOverlay: ReactNode;
};

export function ChatCenterPane({
  isMobileLayout,
  activeChatIdResolved,
  isWorkspaceHome,
  isNewChatPlaceholder,
  showChatTransitionLoading,
  showScrollToBottom,
  onJumpToBottom,
  header,
  statusNotices,
  chatBody,
  composer,
  transitionOverlay,
}: ChatCenterPaneProps) {
  return (
    <section className={`${styles.centerFrame} ${isMobileLayout ? styles.centerFrameMobileScroll : ''}`}>
      {header}
      {statusNotices}
      <>
        {chatBody}

        {!showChatTransitionLoading && activeChatIdResolved && !isWorkspaceHome && !isNewChatPlaceholder && showScrollToBottom && (
          <button
            type="button"
            className={styles.scrollBottomButton}
            onClick={onJumpToBottom}
            aria-label="맨 아래로 이동"
            title="맨 아래로 이동"
          >
            <ChevronDown size={16} />
          </button>
        )}

        {composer}
        {transitionOverlay}
      </>
    </section>
  );
}
