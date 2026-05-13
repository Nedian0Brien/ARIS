'use client';

import type { RefObject } from 'react';
import type { AgentFlavor, SessionChat } from '@/lib/happy/types';
import { WorkspaceHome } from '../../WorkspaceHome';
import styles from '../../ChatInterface.module.css';

type WorkspaceHomePaneProps = {
  agentFlavor: AgentFlavor | string;
  chatEntryPendingRevealClassName: string;
  chats: SessionChat[];
  isMobileLayout: boolean;
  projectPath: string;
  scrollRef: RefObject<HTMLDivElement | null>;
  sessionId: string;
  sessionTitle: string;
  showChatTransitionLoading: boolean;
  onBack: () => void;
  onNewChat: () => void;
  onSelectChat: (chatId: string) => void;
  onStreamScroll: () => void;
};

export function WorkspaceHomePane({
  agentFlavor,
  chatEntryPendingRevealClassName,
  chats,
  isMobileLayout,
  projectPath,
  scrollRef,
  sessionId,
  sessionTitle,
  showChatTransitionLoading,
  onBack,
  onNewChat,
  onSelectChat,
  onStreamScroll,
}: WorkspaceHomePaneProps) {
  return (
    <div
      className={`${styles.stream} ${isMobileLayout ? styles.streamMobileScroll : ''} ${chatEntryPendingRevealClassName}`}
      ref={scrollRef}
      onScroll={onStreamScroll}
      aria-hidden={showChatTransitionLoading}
    >
      <WorkspaceHome
        sessionId={sessionId}
        sessionTitle={sessionTitle}
        projectPath={projectPath}
        agentFlavor={agentFlavor}
        chats={chats}
        onSelectChat={onSelectChat}
        onNewChat={onNewChat}
        onBack={onBack}
      />
    </div>
  );
}
