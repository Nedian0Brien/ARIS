import type { SessionProtocolEnvelope } from '../../contracts/sessionProtocol.js';
import {
  collectGeminiNestedRecords,
  extractFirstGeminiStringByKeys,
  parseGeminiJsonLine,
} from './geminiProtocolFields.js';
import { mapGeminiCanonicalEventsToProtocol } from './geminiEventBridgeV2.js';
import { GeminiStreamAdapter, looksLikeGeminiActionTranscript } from './geminiStreamAdapter.js';
import type { GeminiActionEvent } from './types.js';

type GeminiMappedLine = {
  envelopes: SessionProtocolEnvelope[];
  action?: GeminiActionEvent;
  actionKey?: string;
  assistantText?: string;
  assistantSource?: 'assistant' | 'message' | 'result';
  assistantPhase?: string;
  assistantIsDelta?: boolean;
  assistantTurnId?: string;
  assistantItemId?: string;
  sessionId?: string;
};

function buildActionEventKey(action: GeminiActionEvent): string {
  const callId = action.callId?.trim() ?? '';
  const command = action.command?.trim() ?? '';
  const path = action.path?.trim() ?? '';
  if (callId) {
    return `${action.actionType}|${callId}`;
  }
  return `${action.actionType}|${command}|${path}`;
}

export function parseGeminiStreamLine(line: string): GeminiMappedLine {
  const adapter = new GeminiStreamAdapter();
  const events = adapter.processLine(line);
  const summary = adapter.summarize();
  const payload = parseGeminiJsonLine(line);
  const payloadType = String(payload?.type ?? '').trim().toLowerCase();
  const directAssistantText = payload
    ? extractFirstGeminiStringByKeys(
      collectGeminiNestedRecords(payload),
      payloadType === 'result'
        ? ['result', 'output', 'text', 'content']
        : ['text', 'message', 'content', 'output', 'result'],
    )
    : '';
  const actionEvent = events.find((event) => event.type === 'tool_completed' || event.type === 'tool_started');
  const textEvent = [...events].reverse().find((event) => event.type === 'text_delta' || event.type === 'text_completed');
  const fallbackAssistantText = !textEvent
    ? (summary.output || directAssistantText || undefined)
    : undefined;
  const envelopes = mapGeminiCanonicalEventsToProtocol(events);
  if (fallbackAssistantText && !envelopes.some((envelope) => envelope.kind === 'text')) {
    envelopes.unshift({
      kind: 'text',
      provider: 'gemini',
      source: payloadType === 'result' ? 'result' : 'assistant',
      ...(summary.outputThreadId ? { sessionId: summary.outputThreadId } : summary.sessionId ? { sessionId: summary.sessionId } : {}),
      ...(summary.outputTurnId ? { turnId: summary.outputTurnId } : {}),
      ...(summary.outputItemId ? { itemId: summary.outputItemId } : {}),
      text: fallbackAssistantText,
    });
  }

  return {
    envelopes,
    ...(actionEvent && ('action' in actionEvent)
      ? {
        action: actionEvent.action,
        actionKey: buildActionEventKey(actionEvent.action),
      }
      : {}),
    ...((textEvent && 'text' in textEvent) || fallbackAssistantText
      ? {
        assistantText: textEvent && 'text' in textEvent ? textEvent.text : fallbackAssistantText,
        assistantSource: textEvent && 'source' in textEvent
          ? (textEvent.source === 'result' ? 'result' : 'assistant')
          : payloadType === 'result' ? 'result' : 'assistant',
        ...(textEvent && 'phase' in textEvent && textEvent.phase ? { assistantPhase: textEvent.phase } : {}),
        ...(textEvent && textEvent.type === 'text_delta' ? { assistantIsDelta: true } : {}),
        ...(textEvent && 'turnId' in textEvent && textEvent.turnId ? { assistantTurnId: textEvent.turnId } : summary.outputTurnId ? { assistantTurnId: summary.outputTurnId } : {}),
        ...(textEvent && 'itemId' in textEvent && textEvent.itemId ? { assistantItemId: textEvent.itemId } : summary.outputItemId ? { assistantItemId: summary.outputItemId } : {}),
      }
      : {}),
    ...(summary.sessionId ? { sessionId: summary.sessionId } : {}),
  };
}

export function mapGeminiStreamOutputToProtocol(stdout: string): { envelopes: SessionProtocolEnvelope[]; sessionId?: string } {
  const adapter = new GeminiStreamAdapter();
  for (const line of stdout.replace(/\r\n/g, '\n').split('\n').map((entry) => entry.trim()).filter(Boolean)) {
    adapter.processLine(line);
  }
  const summary = adapter.summarize();
  const envelopes = mapGeminiCanonicalEventsToProtocol(summary.events);
  if (!envelopes.some((envelope) => envelope.kind === 'text') && summary.output) {
    const insertIndex = envelopes.findIndex((envelope) => envelope.kind === 'turn-end' || envelope.kind === 'stop');
    const synthesizedTextEnvelope: SessionProtocolEnvelope = {
      kind: 'text',
      provider: 'gemini',
      source: 'assistant',
      ...(summary.outputThreadId ? { sessionId: summary.outputThreadId } : {}),
      ...(summary.outputTurnId ? { turnId: summary.outputTurnId } : {}),
      ...(summary.outputItemId ? { itemId: summary.outputItemId } : {}),
      text: summary.output,
    };
    if (insertIndex >= 0) {
      envelopes.splice(insertIndex, 0, synthesizedTextEnvelope);
    } else {
      envelopes.push(synthesizedTextEnvelope);
    }
  }
  return {
    envelopes,
    ...(summary.sessionId ? { sessionId: summary.sessionId } : {}),
  };
}

export function parseGeminiStreamOutput(stdout: string): {
  output: string;
  actions: GeminiActionEvent[];
  sessionId?: string;
  envelopes: SessionProtocolEnvelope[];
  errorText?: string;
} {
  const adapter = new GeminiStreamAdapter();
  for (const line of stdout.replace(/\r\n/g, '\n').split('\n').map((entry) => entry.trim()).filter(Boolean)) {
    adapter.processLine(line);
  }
  const summary = adapter.summarize();

  return {
    output: summary.output,
    actions: summary.actions,
    envelopes: mapGeminiStreamOutputToProtocol(stdout).envelopes,
    ...(summary.sessionId ? { sessionId: summary.sessionId } : {}),
    ...(summary.errorText ? { errorText: summary.errorText } : {}),
  };
}

export { looksLikeGeminiActionTranscript };
