import type { ProviderActionEvent, ProviderRuntimeFlavor, ProviderThreadIdSource } from './providerRuntime.js';

export const SESSION_PROTOCOL_ENVELOPE_KINDS = [
  'assistant_message',
  'tool_action',
  'session_identity',
] as const;

export type SessionProtocolEnvelopeKind = typeof SESSION_PROTOCOL_ENVELOPE_KINDS[number];
export type SessionProtocolEnvelopeSource = 'assistant' | 'result' | 'tool' | 'system' | 'scanner';

type SessionProtocolEnvelopeBase = {
  provider: ProviderRuntimeFlavor;
  source: SessionProtocolEnvelopeSource;
  sessionId?: string;
};

export type SessionProtocolAssistantEnvelope = SessionProtocolEnvelopeBase & {
  kind: 'assistant_message';
  text: string;
};

export type SessionProtocolToolEnvelope = SessionProtocolEnvelopeBase & {
  kind: 'tool_action';
  action: ProviderActionEvent;
  actionKey?: string;
};

export type SessionProtocolIdentityEnvelope = SessionProtocolEnvelopeBase & {
  kind: 'session_identity';
  threadId: string;
  threadIdSource?: ProviderThreadIdSource;
};

export type SessionProtocolEnvelope =
  | SessionProtocolAssistantEnvelope
  | SessionProtocolToolEnvelope
  | SessionProtocolIdentityEnvelope;

export function isSessionProtocolEnvelopeKind(value: string): value is SessionProtocolEnvelopeKind {
  return SESSION_PROTOCOL_ENVELOPE_KINDS.includes(value as SessionProtocolEnvelopeKind);
}
