import type {
  SessionProtocolEnvelope,
  SessionProtocolTextEnvelope,
  SessionProtocolToolCallEndEnvelope,
  SessionProtocolTurnEndEnvelope,
} from '../../contracts/sessionProtocol.js';
import type { GeminiActionEvent } from './types.js';

type SessionHintEventType = 'text' | 'tool-call-start' | 'tool-call-end' | 'turn-start' | 'turn-end';

export function buildGeminiSessionHintMeta(input: {
  eventType: SessionHintEventType;
  callId?: string;
  turnId?: string;
  itemId?: string;
  turnStatus?: string;
}): Record<string, unknown> {
  const event = input.eventType === 'tool-call-end'
    ? {
      t: 'tool-call-end',
      ...(input.callId ? { call: input.callId } : {}),
    }
    : input.eventType === 'tool-call-start'
      ? {
        t: 'tool-call-start',
        ...(input.callId ? { call: input.callId } : {}),
      }
      : input.eventType === 'turn-end'
        ? {
          t: 'turn-end',
          ...(input.turnStatus ? { status: input.turnStatus } : {}),
        }
        : input.eventType === 'turn-start'
          ? { t: 'turn-start' }
          : { t: 'text' };

  return {
    sessionRole: 'agent',
    sessionEventType: input.eventType,
    ...(input.callId ? { sessionCallId: input.callId } : {}),
    ...(input.turnId ? { sessionTurnId: input.turnId } : {}),
    ...(input.itemId ? { sessionItemId: input.itemId } : {}),
    ...(input.turnStatus ? { sessionTurnStatus: input.turnStatus } : {}),
    sessionEvent: {
      role: 'agent',
      ev: {
        ...event,
        ...(input.itemId ? { item: input.itemId } : {}),
      },
    },
  };
}

function findLastEnvelope<TEnvelope extends SessionProtocolEnvelope>(
  envelopes: SessionProtocolEnvelope[] | undefined,
  predicate: (envelope: SessionProtocolEnvelope) => envelope is TEnvelope,
): TEnvelope | undefined {
  if (!Array.isArray(envelopes)) {
    return undefined;
  }
  for (let index = envelopes.length - 1; index >= 0; index -= 1) {
    const envelope = envelopes[index];
    if (predicate(envelope)) {
      return envelope;
    }
  }
  return undefined;
}

export type GeminiPersistedMessageProjection = {
  body: string;
  meta: Record<string, unknown>;
  options?: { type?: string; title?: string };
};

export function projectGeminiToolActionMessage(input: {
  action: GeminiActionEvent;
  actionIndex: number;
  chatId?: string;
  requestedPath: string;
  execCwd: string;
  model?: string;
  threadId?: string;
  envelopes?: SessionProtocolEnvelope[];
}): GeminiPersistedMessageProjection | null {
  const sessionCallId = (input.action.callId || `call-${input.actionIndex + 1}`).trim();
  const outputPreview = input.action.output?.replace(/\n?0;\s*$/g, '').trim() ?? '';
  const body = [
    input.action.command ? `$ ${input.action.command}` : '',
    input.action.path ? `path: ${input.action.path}` : '',
    outputPreview,
  ].filter(Boolean).join('\n').trim();
  if (!body) {
    return null;
  }

  const toolEnvelope = findLastEnvelope(
    input.envelopes,
    (envelope): envelope is SessionProtocolToolCallEndEnvelope => (
      envelope.kind === 'tool-call-end'
      && envelope.toolCallId === sessionCallId
    ),
  );

  return {
    body,
    meta: {
      ...(input.chatId ? { chatId: input.chatId } : {}),
      requestedPath: input.requestedPath,
      execCwd: input.execCwd,
      actionType: input.action.actionType,
      normalizedActionKind: input.action.actionType,
      command: input.action.command,
      path: input.action.path,
      additions: input.action.additions,
      deletions: input.action.deletions,
      hasDiffSignal: input.action.hasDiffSignal,
      ...buildGeminiSessionHintMeta({
        eventType: 'tool-call-end',
        callId: sessionCallId,
        ...(toolEnvelope?.turnId ? { turnId: toolEnvelope.turnId } : {}),
      }),
      streamEvent: 'agent_stream_action',
      agent: 'gemini',
      ...(input.model ? { model: input.model } : {}),
      ...(input.threadId ? { threadId: input.threadId, geminiSessionId: input.threadId } : {}),
    },
    options: {
      type: 'tool',
      title: input.action.title,
    },
  };
}

export function projectGeminiTextMessage(input: {
  output: string;
  chatId?: string;
  requestedPath: string;
  execCwd?: string;
  model?: string;
  threadId?: string;
  messageMeta?: Record<string, unknown>;
  envelopes?: SessionProtocolEnvelope[];
}): GeminiPersistedMessageProjection | null {
  const trimmedOutput = input.output.replace(/\n?0;\s*$/g, '').trim();
  if (!trimmedOutput) {
    return null;
  }

  const textEnvelope = findLastEnvelope(
    input.envelopes,
    (envelope): envelope is SessionProtocolTextEnvelope => envelope.kind === 'text',
  );
  const turnEndEnvelope = findLastEnvelope(
    input.envelopes,
    (envelope): envelope is SessionProtocolTurnEndEnvelope => envelope.kind === 'turn-end',
  );

  const isCommentary = input.messageMeta?.streamEvent === 'agent_commentary';

  return {
    body: textEnvelope?.text?.trim() || trimmedOutput,
    meta: {
      ...(input.chatId ? { chatId: input.chatId } : {}),
      requestedPath: input.requestedPath,
      ...(input.execCwd ? { execCwd: input.execCwd } : {}),
      ...(input.model ? { model: input.model } : {}),
      ...buildGeminiSessionHintMeta({
        eventType: 'text',
        ...(textEnvelope?.turnId ? { turnId: textEnvelope.turnId } : turnEndEnvelope?.turnId ? { turnId: turnEndEnvelope.turnId } : {}),
        ...(textEnvelope?.itemId ? { itemId: textEnvelope.itemId } : {}),
        ...(turnEndEnvelope?.stopReason ? { turnStatus: turnEndEnvelope.stopReason } : {}),
      }),
      agent: 'gemini',
      ...(input.threadId ? { threadId: input.threadId, geminiSessionId: input.threadId } : {}),
      ...(input.messageMeta ?? {}),
      ...(isCommentary ? { isThoughtCard: true } : {}),
    },
    options: isCommentary
      ? {
        type: 'tool',
        title: '생각 중...',
      }
      : undefined,
  };
}
