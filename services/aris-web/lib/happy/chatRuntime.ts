import type { UiEvent } from '@/lib/happy/types';

export type RunLifecycleStatus =
  | 'run_started'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed'
  | 'aborted'
  | 'timed_out'
  | 'turn_incomplete'
  | 'run_stale_cleanup';
export type ResolvedChatRunPhase = 'idle' | 'submitting' | 'waiting' | 'running' | 'approval' | 'aborting';

type ResolveChatRunPhaseInput = {
  isSubmitting: boolean;
  isAwaitingReply: boolean;
  isAborting: boolean;
  hasCompletionSignal: boolean;
  runtimeRunning: boolean;
  runStatus?: string | null;
  hasPendingPermission?: boolean;
};

const TERMINAL_RUN_STATUSES = new Set<RunLifecycleStatus>([
  'completed',
  'failed',
  'aborted',
  'timed_out',
  'turn_incomplete',
  'run_stale_cleanup',
]);

function isUserEvent(event: UiEvent): boolean {
  return event.meta?.role === 'user';
}

function isOnOrAfter(timestamp: string, since: string): boolean {
  const sinceEpoch = Date.parse(since);
  const eventEpoch = Date.parse(timestamp);
  if (!Number.isFinite(sinceEpoch) || !Number.isFinite(eventEpoch)) {
    return true;
  }
  return eventEpoch >= sinceEpoch;
}

export function readUiEventStreamEvent(event: UiEvent): string {
  return typeof event.meta?.streamEvent === 'string'
    ? event.meta.streamEvent.trim().toLowerCase()
    : '';
}

export function readUiEventSessionEventType(event: UiEvent): string {
  if (typeof event.meta?.sessionEventType === 'string') {
    return event.meta.sessionEventType.trim().toLowerCase();
  }
  const sessionEvent = event.meta?.sessionEvent;
  if (!sessionEvent || typeof sessionEvent !== 'object') {
    return '';
  }
  const ev = 'ev' in sessionEvent
    && sessionEvent.ev
    && typeof sessionEvent.ev === 'object'
    ? sessionEvent.ev as Record<string, unknown>
    : null;
  if (!ev) {
    return '';
  }
  return typeof ev.t === 'string' ? ev.t.trim().toLowerCase() : '';
}

export function readUiEventTurnStatus(event: UiEvent): string {
  if (typeof event.meta?.sessionTurnStatus === 'string') {
    return event.meta.sessionTurnStatus.trim().toLowerCase();
  }
  const sessionEvent = event.meta?.sessionEvent;
  if (!sessionEvent || typeof sessionEvent !== 'object') {
    return '';
  }
  const ev = 'ev' in sessionEvent
    && sessionEvent.ev
    && typeof sessionEvent.ev === 'object'
    ? sessionEvent.ev as Record<string, unknown>
    : null;
  if (!ev) {
    return '';
  }
  return typeof ev.status === 'string' ? ev.status.trim().toLowerCase() : '';
}

export function readUiEventRunStatus(event: UiEvent): string {
  const direct = typeof event.meta?.runStatus === 'string'
    ? event.meta.runStatus.trim().toLowerCase()
    : '';
  if (direct) {
    return direct;
  }
  return readUiEventTurnStatus(event);
}

export function isRunLifecycleEvent(event: UiEvent): boolean {
  return readUiEventStreamEvent(event) === 'run_status';
}

export function isTerminalRunStatus(status: string | null | undefined): boolean {
  return TERMINAL_RUN_STATUSES.has((status ?? '').trim().toLowerCase() as RunLifecycleStatus);
}

export function hasAgentCompletionSignal(event: UiEvent): boolean {
  if (isUserEvent(event)) {
    return false;
  }

  const streamEvent = readUiEventStreamEvent(event);
  if (
    streamEvent === 'runtime_disconnected'
    || streamEvent === 'stream_error'
    || streamEvent === 'runtime_error'
  ) {
    return true;
  }

  const sessionEventType = readUiEventSessionEventType(event);
  if (sessionEventType === 'turn-end' || sessionEventType === 'stop') {
    return true;
  }

  const turnStatus = readUiEventTurnStatus(event);
  return (
    turnStatus === 'completed'
    || turnStatus === 'failed'
    || turnStatus === 'aborted'
    || turnStatus === 'timed_out'
    || turnStatus === 'turn_incomplete'
    || turnStatus === 'run_stale_cleanup'
  );
}

export function isFinalAgentReplyEvent(event: UiEvent): boolean {
  if (isUserEvent(event)) {
    return false;
  }

  const streamEvent = readUiEventStreamEvent(event);
  return streamEvent === 'agent_message' || streamEvent === 'agent_message_recovered';
}

export function hasFinalAgentReplySince(events: UiEvent[], since: string | null): boolean {
  if (!since) {
    return false;
  }

  return events.some((event) => isFinalAgentReplyEvent(event) && isOnOrAfter(event.timestamp, since));
}

export function getLatestAgentEventTimestampSince(events: UiEvent[], since: string | null): string | null {
  if (!since) {
    return null;
  }

  let latestTimestamp: string | null = null;
  for (const event of events) {
    if (isUserEvent(event) || !isOnOrAfter(event.timestamp, since)) {
      continue;
    }
    latestTimestamp = event.timestamp;
  }

  return latestTimestamp;
}

export function getLatestRunStatusSince(events: UiEvent[], since: string | null): string {
  if (!since) {
    return '';
  }

  let latestStatus = '';
  for (const event of events) {
    if (!isRunLifecycleEvent(event) || !isOnOrAfter(event.timestamp, since)) {
      continue;
    }
    latestStatus = readUiEventRunStatus(event);
  }

  return latestStatus;
}

export function resolveChatRunPhase(input: ResolveChatRunPhaseInput): ResolvedChatRunPhase {
  const runStatus = (input.runStatus ?? '').trim().toLowerCase();
  if (input.isAborting) {
    return 'aborting';
  }
  if (input.isSubmitting) {
    return 'submitting';
  }
  if (runStatus === 'waiting_for_approval') {
    return input.hasPendingPermission ? 'approval' : 'running';
  }
  if (runStatus === 'run_started') {
    return 'running';
  }
  if (input.runtimeRunning) {
    return 'running';
  }
  if (input.hasCompletionSignal || isTerminalRunStatus(runStatus)) {
    return 'idle';
  }
  if (input.isAwaitingReply) {
    return 'waiting';
  }
  return 'idle';
}
