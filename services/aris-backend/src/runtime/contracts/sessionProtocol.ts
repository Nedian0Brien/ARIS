import type { ProviderActionEvent, ProviderRuntimeFlavor, ProviderThreadIdSource } from './providerRuntime.js';

export const SESSION_PROTOCOL_ENVELOPE_KINDS = [
  'turn-start',
  'turn-end',
  'tool-call-start',
  'tool-call-end',
  'text',
  'stop',
] as const;

export type SessionProtocolEnvelopeKind = typeof SESSION_PROTOCOL_ENVELOPE_KINDS[number];
export type SessionProtocolEnvelopeSource = 'assistant' | 'result' | 'tool' | 'system' | 'scanner';
export type SessionProtocolStopReason = 'completed' | 'aborted' | 'error' | 'timeout' | 'unknown';

type SessionProtocolEnvelopeBase = {
  provider: ProviderRuntimeFlavor;
  source: SessionProtocolEnvelopeSource;
  sessionId?: string;
  turnId?: string;
};

export type SessionProtocolTurnStartEnvelope = SessionProtocolEnvelopeBase & {
  kind: 'turn-start';
  threadId?: string;
  threadIdSource?: ProviderThreadIdSource;
};

export type SessionProtocolTurnEndEnvelope = SessionProtocolEnvelopeBase & {
  kind: 'turn-end';
  threadId?: string;
  threadIdSource?: ProviderThreadIdSource;
  stopReason: SessionProtocolStopReason;
};

export type SessionProtocolToolCallStartEnvelope = SessionProtocolEnvelopeBase & {
  kind: 'tool-call-start';
  toolCallId: string;
  toolName: string;
  action?: ProviderActionEvent;
};

export type SessionProtocolToolCallEndEnvelope = SessionProtocolEnvelopeBase & {
  kind: 'tool-call-end';
  toolCallId: string;
  toolName: string;
  action?: ProviderActionEvent;
  stopReason: SessionProtocolStopReason;
};

export type SessionProtocolTextEnvelope = SessionProtocolEnvelopeBase & {
  kind: 'text';
  text: string;
  itemId?: string;
  partial?: boolean;
};

export type SessionProtocolStopEnvelope = SessionProtocolEnvelopeBase & {
  kind: 'stop';
  reason: SessionProtocolStopReason;
};

export type SessionProtocolEnvelope =
  | SessionProtocolTurnStartEnvelope
  | SessionProtocolTurnEndEnvelope
  | SessionProtocolToolCallStartEnvelope
  | SessionProtocolToolCallEndEnvelope
  | SessionProtocolTextEnvelope
  | SessionProtocolStopEnvelope;

export function isSessionProtocolEnvelopeKind(value: string): value is SessionProtocolEnvelopeKind {
  return SESSION_PROTOCOL_ENVELOPE_KINDS.includes(value as SessionProtocolEnvelopeKind);
}
