import type { ProviderActionEvent, ProviderTextEvent } from '../../contracts/providerRuntime.js';
import type { SessionProtocolStopReason } from '../../contracts/sessionProtocol.js';

export type GeminiMessagePhase =
  | 'commentary'
  | 'final_answer'
  | 'result'
  | 'unknown';

type GeminiCanonicalEventBase = {
  threadId?: string;
  turnId?: string;
  itemId?: string;
  callId?: string;
  phase?: GeminiMessagePhase;
  rawLine: string;
};

export type GeminiCanonicalTurnStartedEvent = GeminiCanonicalEventBase & {
  type: 'turn_started';
};

export type GeminiCanonicalTextDeltaEvent = GeminiCanonicalEventBase & {
  type: 'text_delta';
  text: string;
  source: ProviderTextEvent['source'];
};

export type GeminiCanonicalTextCompletedEvent = GeminiCanonicalEventBase & {
  type: 'text_completed';
  text: string;
  source: ProviderTextEvent['source'];
};

export type GeminiCanonicalToolStartedEvent = GeminiCanonicalEventBase & {
  type: 'tool_started';
  action: ProviderActionEvent;
  toolName: string;
};

export type GeminiCanonicalToolCompletedEvent = GeminiCanonicalEventBase & {
  type: 'tool_completed';
  action: ProviderActionEvent;
  toolName: string;
  stopReason: SessionProtocolStopReason;
};

export type GeminiCanonicalPermissionRequestedEvent = GeminiCanonicalEventBase & {
  type: 'permission_requested';
  command: string;
  reason: string;
};

export type GeminiCanonicalTurnCompletedEvent = GeminiCanonicalEventBase & {
  type: 'turn_completed';
  stopReason: 'completed';
};

export type GeminiCanonicalTurnAbortedEvent = GeminiCanonicalEventBase & {
  type: 'turn_aborted';
  stopReason: 'aborted' | 'timeout';
};

export type GeminiCanonicalTurnFailedEvent = GeminiCanonicalEventBase & {
  type: 'turn_failed';
  stopReason: 'error';
  errorText?: string;
};

export type GeminiCanonicalEvent =
  | GeminiCanonicalTurnStartedEvent
  | GeminiCanonicalTextDeltaEvent
  | GeminiCanonicalTextCompletedEvent
  | GeminiCanonicalToolStartedEvent
  | GeminiCanonicalToolCompletedEvent
  | GeminiCanonicalPermissionRequestedEvent
  | GeminiCanonicalTurnCompletedEvent
  | GeminiCanonicalTurnAbortedEvent
  | GeminiCanonicalTurnFailedEvent;

export function isGeminiCanonicalTextEvent(
  event: GeminiCanonicalEvent,
): event is GeminiCanonicalTextDeltaEvent | GeminiCanonicalTextCompletedEvent {
  return event.type === 'text_delta' || event.type === 'text_completed';
}

export function isGeminiCanonicalToolEvent(
  event: GeminiCanonicalEvent,
): event is GeminiCanonicalToolStartedEvent | GeminiCanonicalToolCompletedEvent {
  return event.type === 'tool_started' || event.type === 'tool_completed';
}

export function normalizeGeminiMessagePhase(value: unknown): GeminiMessagePhase | undefined {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!normalized) {
    return undefined;
  }
  if (normalized === 'commentary' || normalized === 'final_answer' || normalized === 'result') {
    return normalized;
  }
  return 'unknown';
}
