'use client';

import React from 'react';
import type { CSSProperties, RefObject } from 'react';
import type { AgentFlavor } from '@/lib/happy/types';
import { ChevronLeft } from 'lucide-react';
import { CHAT_AGENT_CHOICES } from '../constants';
import { resolveAgentMeta, resolveAgentSubtitle } from '../helpers';
import styles from '../../ChatInterface.module.css';

type NewChatPlaceholderPaneProps = {
  chatEntryPendingRevealClassName: string;
  isMobileLayout: boolean;
  scrollRef: RefObject<HTMLDivElement | null>;
  showChatTransitionLoading: boolean;
  onBack: () => void;
  onCreateChat: (agentFlavor: AgentFlavor) => void | Promise<void>;
  onStreamScroll: () => void;
};

export function NewChatPlaceholderPane({
  chatEntryPendingRevealClassName,
  isMobileLayout,
  scrollRef,
  showChatTransitionLoading,
  onBack,
  onCreateChat,
  onStreamScroll,
}: NewChatPlaceholderPaneProps) {
  return (
    <div
      className={`${styles.stream} ${isMobileLayout ? styles.streamMobileScroll : ''} ${chatEntryPendingRevealClassName}`}
      ref={scrollRef}
      onScroll={onStreamScroll}
      aria-hidden={showChatTransitionLoading}
    >
      <div className={styles.agentSelectorContainer}>
        <button
          type="button"
          className={styles.agentSelectorBackButton}
          onClick={onBack}
        >
          <ChevronLeft size={14} />
          뒤로
        </button>
        <h3 className={styles.agentSelectorTitle}>어떤 에이전트와 대화를 시작할까요?</h3>
        <div className={styles.agentSelectorGrid}>
          {CHAT_AGENT_CHOICES.map((choice) => {
            const choiceMeta = resolveAgentMeta(choice);
            const ChoiceIcon = choiceMeta.Icon;
            return (
              <button
                key={choice}
                type="button"
                className={styles.agentSelectorCard}
                onClick={() => void onCreateChat(choice)}
                style={{ '--agent-color': `var(--agent-${choice}-accent)`, '--agent-bg': `var(--agent-${choice}-bg)` } as CSSProperties}
              >
                <div className={styles.agentSelectorIconWrap}>
                  <ChoiceIcon size={28} />
                </div>
                <div>
                  <div className={styles.agentSelectorLabel}>{choiceMeta.label}</div>
                  <div className={styles.agentSelectorDesc}>{resolveAgentSubtitle(choice)}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
