import type { UiEvent } from '@/lib/happy/types';

export type ResolvedChatRunPhase = 'idle' | 'submitting' | 'waiting' | 'running' | 'aborting';

type ResolveChatRunPhaseInput = {
  isSubmitting: boolean;
  isAwaitingReply: boolean;
  isAborting: boolean;
  hasCompletionSignal: boolean;
  runtimeRunning: boolean;
};

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

export function resolveChatRunPhase(input: ResolveChatRunPhaseInput): ResolvedChatRunPhase {
  if (input.isAborting) {
    return 'aborting';
  }
  if (input.isSubmitting) {
    return 'submitting';
  }
  if (input.runtimeRunning) {
    return 'running';
  }
  if (input.hasCompletionSignal) {
    return 'idle';
  }
  if (input.isAwaitingReply) {
    return 'waiting';
  }
  return 'idle';
}
