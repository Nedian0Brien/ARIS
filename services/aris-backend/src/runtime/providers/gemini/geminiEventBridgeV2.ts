import { sanitizeAgentMessageText } from '../../agentMessageSanitizer.js';
import type { ProviderTextEvent } from '../../contracts/providerRuntime.js';
import type {
  SessionProtocolEnvelope,
  SessionProtocolStopReason,
} from '../../contracts/sessionProtocol.js';
import type { GeminiCanonicalEvent } from './geminiCanonicalEvents.js';

function buildTurnEndEnvelopes(input: {
  threadId?: string;
  turnId?: string;
  stopReason: SessionProtocolStopReason;
  source: SessionProtocolEnvelope['source'];
}): SessionProtocolEnvelope[] {
  return [
    {
      kind: 'turn-end',
      provider: 'gemini',
      source: input.source,
      ...(input.threadId ? { sessionId: input.threadId, threadId: input.threadId, threadIdSource: 'observed' as const } : {}),
      ...(input.turnId ? { turnId: input.turnId } : {}),
      stopReason: input.stopReason,
    },
    {
      kind: 'stop',
      provider: 'gemini',
      source: input.source,
      ...(input.threadId ? { sessionId: input.threadId } : {}),
      ...(input.turnId ? { turnId: input.turnId } : {}),
      reason: input.stopReason,
    },
  ];
}

export function mapGeminiCanonicalEventToProtocolEnvelopes(event: GeminiCanonicalEvent): SessionProtocolEnvelope[] {
  switch (event.type) {
    case 'turn_started':
      return [{
        kind: 'turn-start',
        provider: 'gemini',
        source: 'system',
        ...(event.threadId ? { sessionId: event.threadId, threadId: event.threadId, threadIdSource: 'observed' as const } : {}),
        ...(event.turnId ? { turnId: event.turnId } : {}),
      }];
    case 'text_completed':
      return [{
        kind: 'text',
        provider: 'gemini',
        source: event.source,
        ...(event.threadId ? { sessionId: event.threadId } : {}),
        ...(event.turnId ? { turnId: event.turnId } : {}),
        ...(event.itemId ? { itemId: event.itemId } : {}),
        text: sanitizeAgentMessageText(event.text),
      }];
    case 'tool_started':
      return [{
        kind: 'tool-call-start',
        provider: 'gemini',
        source: 'tool',
        ...(event.threadId ? { sessionId: event.threadId } : {}),
        ...(event.turnId ? { turnId: event.turnId } : {}),
        toolCallId: event.callId ?? `${event.toolName}:${event.turnId ?? event.threadId ?? 'unknown'}`,
        toolName: event.toolName,
        action: event.action,
      }];
    case 'tool_completed':
      return [{
        kind: 'tool-call-end',
        provider: 'gemini',
        source: 'tool',
        ...(event.threadId ? { sessionId: event.threadId } : {}),
        ...(event.turnId ? { turnId: event.turnId } : {}),
        toolCallId: event.callId ?? `${event.toolName}:${event.turnId ?? event.threadId ?? 'unknown'}`,
        toolName: event.toolName,
        action: event.action,
        stopReason: event.stopReason,
      }];
    case 'turn_completed':
      return buildTurnEndEnvelopes({
        threadId: event.threadId,
        turnId: event.turnId,
        stopReason: 'completed',
        source: 'result',
      });
    case 'turn_aborted':
      return buildTurnEndEnvelopes({
        threadId: event.threadId,
        turnId: event.turnId,
        stopReason: event.stopReason,
        source: 'result',
      });
    case 'turn_failed':
      return buildTurnEndEnvelopes({
        threadId: event.threadId,
        turnId: event.turnId,
        stopReason: 'error',
        source: 'result',
      });
    case 'text_delta':
    case 'permission_requested':
      return [];
  }
}

export function mapGeminiCanonicalEventsToProtocol(events: GeminiCanonicalEvent[]): SessionProtocolEnvelope[] {
  return events.flatMap((event) => mapGeminiCanonicalEventToProtocolEnvelopes(event));
}

export function buildGeminiProviderTextEvent(event: GeminiCanonicalEvent): ProviderTextEvent | null {
  if (event.type === 'text_delta') {
    return {
      text: event.text,
      source: event.source,
      ...(event.threadId ? { threadId: event.threadId } : {}),
      ...(event.turnId ? { turnId: event.turnId } : {}),
      ...(event.itemId ? { itemId: event.itemId } : {}),
      partial: true,
    };
  }
  if (event.type === 'text_completed') {
    return {
      text: sanitizeAgentMessageText(event.text),
      source: event.source,
      ...(event.threadId ? { threadId: event.threadId } : {}),
      ...(event.turnId ? { turnId: event.turnId } : {}),
      ...(event.itemId ? { itemId: event.itemId } : {}),
      envelopes: mapGeminiCanonicalEventToProtocolEnvelopes(event),
    };
  }
  return null;
}
