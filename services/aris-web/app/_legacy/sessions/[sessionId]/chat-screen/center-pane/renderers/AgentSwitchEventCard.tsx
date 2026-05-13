'use client';

import React from 'react';
import { ArrowRightLeft } from 'lucide-react';
import { readAgentSwitchInfo } from '@/lib/happy/chatRuntime';
import type { UiEvent } from '@/lib/happy/types';
import { formatClock } from '../../helpers';
import styles from '../../../ChatInterface.module.css';

const AGENT_LABELS: Record<string, string> = {
  codex: 'Codex',
  claude: 'Claude',
  gemini: 'Gemini',
};

function labelForAgent(agent: string): string {
  return AGENT_LABELS[agent.toLowerCase()] ?? agent;
}

export function AgentSwitchEventCard({ event }: { event: UiEvent }) {
  const info = readAgentSwitchInfo(event);
  if (!info) {
    return null;
  }
  const fromLabel = labelForAgent(info.fromAgent);
  const toLabel = labelForAgent(info.toAgent);
  const switchTime = formatClock(event.timestamp);
  const ariaLabel = `에이전트 ${fromLabel}에서 ${toLabel}로 변경됨 ${switchTime}`;

  return (
    <div
      className={`${styles.runStatusCard} ${styles.toneSky}`}
      title={`${fromLabel} → ${toLabel} · ${switchTime}`}
      aria-label={ariaLabel}
      data-stream-event="agent_switched"
    >
      <ArrowRightLeft size={13} className={styles.runStatusIcon} />
      <span className={styles.runStatusLabel}>{`에이전트 변경: ${fromLabel} → ${toLabel}`}</span>
      <span className={styles.runStatusSeparator}>·</span>
      <time className={styles.runStatusTime} dateTime={event.timestamp}>
        {switchTime}
      </time>
    </div>
  );
}
