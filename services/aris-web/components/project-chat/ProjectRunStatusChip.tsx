'use client';
import React from 'react';
import { AlertCircle, Check, Clock3, Terminal } from 'lucide-react';
import { readUiEventRunStatus } from '@/lib/happy/chatRuntime';
import type { UiEvent } from '@/lib/happy/types';

function formatRelativeTime(value: string | null | undefined): string {
  if (!value) return 'unknown';
  const time = Date.parse(value);
  if (Number.isNaN(time)) return 'unknown';

  const diffMs = Math.max(0, Date.now() - time);
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return 'now';
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  return `${Math.floor(diffMs / day)}d ago`;
}

function projectRunStatusMeta(runStatus: string) {
  const normalized = runStatus.trim().toLowerCase();
  if (normalized === 'run_started' || normalized === 'turn_started' || normalized === 'model_normalized') {
    return { Icon: Terminal, label: '실행 시작', tone: 'run' };
  }
  if (normalized === 'completed' || normalized === 'run_completed') {
    return { Icon: Check, label: '실행 종료', tone: 'done' };
  }
  if (normalized === 'waiting_for_approval') {
    return { Icon: Clock3, label: '승인 대기', tone: 'wait' };
  }
  if (normalized === 'aborted' || normalized === 'run_aborted' || normalized === 'cancelled' || normalized === 'canceled') {
    return { Icon: AlertCircle, label: 'aborted', tone: 'alert' };
  }
  return { Icon: AlertCircle, label: normalized ? normalized.replace(/_/g, ' ') : '실행 상태', tone: 'alert' };
}

export function ProjectRunStatusChip({ event }: { event: UiEvent }) {
  const runStatus = readUiEventRunStatus(event);
  const { Icon, label, tone } = projectRunStatusMeta(runStatus);
  const relativeTime = formatRelativeTime(event.timestamp);

  return (
    <div className="pc-run-status" data-tone={tone} title={`${label} · ${relativeTime}`} aria-label={`${label} · ${relativeTime}`}>
      <span className="pc-run-status__icon" aria-hidden="true"><Icon size={12} /></span>
      <span className="pc-run-status__label">{label}</span>
      <time className="pc-run-status__time" dateTime={event.timestamp}>{relativeTime}</time>
    </div>
  );
}
