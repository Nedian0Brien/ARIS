'use client';

import React from 'react';
import { CheckCircle2, CircleAlert, Clock3, Play } from 'lucide-react';
import { readUiEventRunStatus } from '@/lib/happy/chatRuntime';
import type { UiEvent } from '@/lib/happy/types';
import { formatClock } from '../../helpers';
import styles from '../../../ChatInterface.module.css';

type RunStatusTone = 'sky' | 'emerald' | 'amber' | 'red';

type RunStatusMeta = {
  label: string;
  tone: RunStatusTone;
  Icon: React.ComponentType<{ size?: number; className?: string }>;
};

function getToneClass(tone: RunStatusTone): string {
  const map: Record<RunStatusTone, string> = {
    sky: styles.toneSky,
    emerald: styles.toneEmerald,
    amber: styles.toneAmber,
    red: styles.toneRed,
  };
  return map[tone];
}

function resolveRunStatusMeta(runStatus: string): RunStatusMeta {
  const normalized = runStatus.trim().toLowerCase();

  if (normalized === 'run_started' || normalized === 'turn_started' || normalized === 'model_normalized') {
    return {
      label: '실행 시작',
      tone: 'sky',
      Icon: Play,
    };
  }

  if (normalized === 'completed' || normalized === 'run_completed') {
    return {
      label: '실행 종료',
      tone: 'emerald',
      Icon: CheckCircle2,
    };
  }

  if (normalized === 'waiting_for_approval') {
    return {
      label: '승인 대기',
      tone: 'amber',
      Icon: Clock3,
    };
  }

  return {
    label: normalized ? normalized.replace(/_/g, ' ') : '실행 상태',
    tone: 'red',
    Icon: CircleAlert,
  };
}

export function RunStatusEventCard({ event }: { event: UiEvent }) {
  const runStatus = readUiEventRunStatus(event);
  const meta = resolveRunStatusMeta(runStatus);
  const statusTime = formatClock(event.timestamp);

  return (
    <div
      className={`${styles.runStatusCard} ${getToneClass(meta.tone)}`}
      title={`${meta.label} · ${statusTime}`}
      aria-label={`${meta.label} ${statusTime}`}
    >
      <meta.Icon size={13} className={styles.runStatusIcon} />
      <span className={styles.runStatusLabel}>{meta.label}</span>
      <span className={styles.runStatusSeparator}>·</span>
      <time className={styles.runStatusTime} dateTime={event.timestamp}>
        {statusTime}
      </time>
    </div>
  );
}
