import type { RuntimeMessage } from '../../../types.js';
import type { SessionProtocolEnvelope } from '../../contracts/sessionProtocol.js';
import type {
  ProviderActionEvent,
  ProviderCliResult,
  ProviderResumeTarget,
  ProviderRuntimeProject,
  ProviderThreadIdSource,
  ProviderTurnRequest,
  ProviderTurnResult,
} from '../../contracts/providerRuntime.js';

export type GeminiRuntimeProject = ProviderRuntimeProject<'gemini'>;
export type GeminiResumeTarget = ProviderResumeTarget;
export type GeminiThreadIdSource = ProviderThreadIdSource;
export type GeminiActionEvent = ProviderActionEvent;

export type GeminiCliResult = ProviderCliResult & {
  protocolEnvelopes?: SessionProtocolEnvelope[];
};

export type GeminiTurnResult = ProviderTurnResult & {
  protocolEnvelopes?: SessionProtocolEnvelope[];
  agentMessagePersisted?: boolean;
};

export type GeminiSessionSnapshot = {
  scope: {
    sessionId: string;
    chatId?: string;
  };
  observedThreadId?: string;
  activeThreadId?: string;
  threadIdSource?: GeminiThreadIdSource;
};

export type GeminiTurnExecutor = (
  input: ProviderTurnRequest<GeminiRuntimeProject> & {
    preferredThreadId?: string;
  },
) => Promise<GeminiTurnResult>;

export type GeminiMessageHistoryLoader = (sessionId: string) => Promise<RuntimeMessage[]>;
