import { inferActionTypeFromCommand, titleForActionType } from '../../actionType.js';
import { sanitizeAgentMessageText } from '../../agentMessageSanitizer.js';
import { summarizeDiffText } from '../../diffStats.js';
import type { SessionProtocolEnvelope, SessionProtocolStopReason } from '../../contracts/sessionProtocol.js';
import {
  collectGeminiNestedRecords,
  extractFirstGeminiStringByKeys,
  extractGeminiObservedSessionId,
  parseGeminiJsonLine,
} from './geminiProtocolFields.js';
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

type GeminiAssistantAggregate = {
  key: string;
  text: string;
  sequence: number;
  source?: GeminiMappedLine['assistantSource'];
  turnId?: string;
  sessionId?: string;
};

type GeminiAssistantAccumulatorState = {
  aggregates: Map<string, GeminiAssistantAggregate>;
  latestKeyByTurn: Map<string, string>;
  latestKey?: string;
  nextSyntheticKey: number;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function unwrapShellCommand(command: string): string {
  let current = command.trim();
  if (current.startsWith('$ ')) {
    current = current.slice(2).trim();
  }

  const wrappers = [/^(?:\/bin\/)?bash\s+-lc\s+([\s\S]+)$/i, /^(?:\/bin\/)?sh\s+-lc\s+([\s\S]+)$/i];
  for (const wrapper of wrappers) {
    const match = current.match(wrapper);
    if (!match) {
      continue;
    }
    const inner = match[1]?.trim() ?? '';
    if (
      (inner.startsWith('"') && inner.endsWith('"'))
      || (inner.startsWith("'") && inner.endsWith("'"))
    ) {
      current = inner.slice(1, -1).trim();
    } else {
      current = inner;
    }
  }

  return current;
}

function extractPathFromCommand(command: string): string {
  const tokens = command.split(/\s+/).filter(Boolean);
  if (tokens.length < 2) {
    return '';
  }

  const rawLast = tokens[tokens.length - 1] ?? '';
  const last = rawLast.replace(/^[("'`]+|[)"'`;,]+$/g, '');
  if (!last || last.startsWith('-')) {
    return '';
  }
  if (last.includes('/') || last.includes('.') || last.startsWith('~')) {
    return last;
  }
  return '';
}

function looksLikeShellCommand(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 500 || trimmed.includes('\n')) {
    return false;
  }
  if (/[^\x20-\x7E]/.test(trimmed)) {
    return false;
  }
  return /^(?:\$ )?[a-z0-9._/-]+(?:\s+.+)?$/i.test(trimmed);
}

export function looksLikeGeminiActionTranscript(value: string): boolean {
  const text = value.trim().toLowerCase();
  if (!text) {
    return false;
  }
  return (
    text.startsWith('$ ')
    || text.includes('\n$ ')
    || text.includes('exit code:')
    || text.includes('diff --git')
    || text.includes('*** update file:')
    || text.includes('*** add file:')
    || text.includes('*** delete file:')
    || text.includes('@@ ')
  );
}

function isGeminiCommentaryPhase(phase: string | undefined): boolean {
  return phase?.trim().toLowerCase() === 'commentary';
}

function buildActionEventKey(action: GeminiActionEvent): string {
  const callId = action.callId?.trim() ?? '';
  const command = action.command?.trim() ?? '';
  const path = action.path?.trim() ?? '';
  if (callId) {
    return `${action.actionType}|${callId}`;
  }
  return `${action.actionType}|${command}|${path}`;
}

function createGeminiAssistantAccumulatorState(): GeminiAssistantAccumulatorState {
  return {
    aggregates: new Map<string, GeminiAssistantAggregate>(),
    latestKeyByTurn: new Map<string, string>(),
    nextSyntheticKey: 0,
  };
}

function resolveGeminiAssistantAggregateKey(
  parsedLine: GeminiMappedLine,
  state: GeminiAssistantAccumulatorState,
): string {
  if (parsedLine.assistantItemId) {
    const key = `item:${parsedLine.assistantItemId}`;
    if (parsedLine.assistantTurnId) {
      state.latestKeyByTurn.set(parsedLine.assistantTurnId, key);
    }
    state.latestKey = key;
    return key;
  }

  if (parsedLine.assistantTurnId) {
    const turnKey = state.latestKeyByTurn.get(parsedLine.assistantTurnId);
    if (parsedLine.assistantIsDelta && turnKey) {
      state.latestKey = turnKey;
      return turnKey;
    }

    const key = `turn:${parsedLine.assistantTurnId}:message:${state.nextSyntheticKey += 1}`;
    state.latestKeyByTurn.set(parsedLine.assistantTurnId, key);
    state.latestKey = key;
    return key;
  }

  if (parsedLine.assistantIsDelta && state.latestKey) {
    return state.latestKey;
  }

  const key = `message:${state.nextSyntheticKey += 1}`;
  state.latestKey = key;
  return key;
}

function accumulateGeminiAssistantText(
  parsedLine: GeminiMappedLine,
  state: GeminiAssistantAccumulatorState,
  sequence: number,
): void {
  if (isGeminiCommentaryPhase(parsedLine.assistantPhase)) {
    return;
  }

  const assistantText = parsedLine.assistantText ?? '';
  if (!assistantText) {
    return;
  }

  const key = resolveGeminiAssistantAggregateKey(parsedLine, state);
  const existing = state.aggregates.get(key);
  const nextText = parsedLine.assistantIsDelta
    ? `${existing?.text ?? ''}${assistantText}`
    : assistantText;

  state.aggregates.set(key, {
    key,
    text: nextText,
    sequence,
    source: parsedLine.assistantSource ?? existing?.source,
    turnId: parsedLine.assistantTurnId ?? existing?.turnId,
    sessionId: parsedLine.sessionId ?? existing?.sessionId,
  });
}

function getLatestGeminiAssistantAggregate(
  state: GeminiAssistantAccumulatorState,
): GeminiAssistantAggregate | undefined {
  let latest: GeminiAssistantAggregate | undefined;
  for (const aggregate of state.aggregates.values()) {
    if (!latest || aggregate.sequence >= latest.sequence) {
      latest = aggregate;
    }
  }
  return latest;
}

function resolveStopReason(payloadType: string, payloadSubtype: string, payload: Record<string, unknown>): SessionProtocolStopReason | undefined {
  const normalizedStopReason = String(payload.stop_reason ?? payload.stopReason ?? payload.reason ?? '').trim().toLowerCase();
  if (normalizedStopReason.includes('abort') || payloadSubtype.includes('abort')) {
    return 'aborted';
  }
  if (normalizedStopReason.includes('timeout')) {
    return 'timeout';
  }
  if (normalizedStopReason.includes('error') || payloadType === 'error') {
    return 'error';
  }
  if (payloadType === 'result' || payloadSubtype.includes('final')) {
    return 'completed';
  }
  return undefined;
}

function buildToolName(action: GeminiActionEvent, payloadSubtype: string): string {
  if (payloadSubtype) {
    return payloadSubtype;
  }
  if (action.command) {
    return action.command.split(/\s+/)[0] || action.actionType;
  }
  return action.actionType;
}

function inferGeminiActionTypeFromActionLabel(label: string, command: string): GeminiActionEvent['actionType'] {
  const normalized = label.trim().toLowerCase();
  if (normalized === 'read') {
    return 'file_read';
  }
  if (normalized === 'write' || normalized === 'edit' || normalized === 'patch') {
    return 'file_write';
  }
  if (normalized === 'listfiles' || normalized === 'list') {
    return 'file_list';
  }
  return inferActionTypeFromCommand(command);
}

function extractStructuredGeminiAction(payload: Record<string, unknown>): GeminiActionEvent | undefined {
  const params = asRecord(payload.params);
  const item = asRecord(params?.item);
  if (!params || !item) {
    return undefined;
  }

  const itemType = String(item.type ?? '').trim().toLowerCase();
  const commandActions = Array.isArray(item.commandActions)
    ? item.commandActions.map((entry) => asRecord(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];
  const changes = Array.isArray(item.changes)
    ? item.changes.map((entry) => asRecord(entry)).filter((entry): entry is Record<string, unknown> => Boolean(entry))
    : [];

  if (itemType !== 'commandexecution' && itemType !== 'filechange') {
    return undefined;
  }

  const command = String(
    commandActions[0]?.command
    ?? item.command
    ?? '',
  ).trim();
  const actionLabel = String(commandActions[0]?.type ?? itemType).trim();
  const actionType = itemType === 'filechange'
    ? 'file_write'
    : inferGeminiActionTypeFromActionLabel(actionLabel, command);

  const path = String(
    commandActions[0]?.path
    ?? changes[0]?.path
    ?? '',
  ).trim();
  const output = String(
    item.aggregatedOutput
    ?? changes[0]?.diff
    ?? '',
  ).trim();
  const diffStats = summarizeDiffText(output);
  const callId = String(item.id ?? '').trim() || undefined;

  return {
    actionType,
    title: titleForActionType(actionType),
    ...(callId ? { callId } : {}),
    ...(command ? { command: unwrapShellCommand(command) } : {}),
    ...(path ? { path } : {}),
    ...(output ? { output } : {}),
    additions: diffStats.additions,
    deletions: diffStats.deletions,
    hasDiffSignal: diffStats.hasDiffSignal,
  };
}

export function parseGeminiStreamLine(line: string): GeminiMappedLine {
  const payload = parseGeminiJsonLine(line);
  if (!payload) {
    return { envelopes: [] };
  }

  const params = asRecord(payload.params);
  const msg = asRecord(params?.msg);
  const item = asRecord(params?.item);
  const method = String(payload.method ?? '').trim().toLowerCase();
  const payloadType = String(payload.type ?? '').trim().toLowerCase();
  const payloadSubtype = String(payload.subtype ?? '').trim().toLowerCase();
  const lineLower = line.toLowerCase();
  const isSystem = payloadType === 'system' || payloadType === 'init' || payloadSubtype === 'init';
  const seemsToolEvent = (
    payloadType === 'tool'
    || payloadSubtype.includes('tool')
    || lineLower.includes('"tool')
    || lineLower.includes('commandexecution')
    || lineLower.includes('exec_command')
    || lineLower.includes('file_change')
    || lineLower.includes('filechange')
    || method === 'item/completed'
    || method === 'item/started'
  );
  const records = collectGeminiNestedRecords(payload);
  const role = extractFirstGeminiStringByKeys(records, ['role']).toLowerCase();
  const msgType = String(msg?.type ?? '').trim().toLowerCase();
  const itemType = String(item?.type ?? '').trim().toLowerCase();
  const assistantPhase = String(msg?.phase ?? item?.phase ?? '').trim().toLowerCase() || undefined;
  const seemsAssistantEvent = (
    (payloadType === 'message' && role === 'assistant')
    || payloadType.includes('assistant')
    || payloadSubtype.includes('assistant')
    || payloadSubtype.includes('final')
    || payloadType === 'result'
    || lineLower.includes('"agent_message"')
    || method === 'codex/event/agent_message'
    || (method === 'item/completed' && itemType === 'agentmessage')
  );
  const commandRaw = extractFirstGeminiStringByKeys(records, [
    'command',
    'cmd',
    'parsed_cmd',
    'shellCommand',
    'shell_command',
  ]);
  const command = commandRaw ? unwrapShellCommand(commandRaw) : '';
  const path = extractFirstGeminiStringByKeys(records, [
    'path',
    'filePath',
    'file_path',
    'targetPath',
    'target_path',
  ]);
  const outputCandidate = extractFirstGeminiStringByKeys(records, [
    'aggregatedOutput',
    'aggregated_output',
    'output',
    'stdout',
    'result',
    'text',
  ]);
  const diffStats = summarizeDiffText(outputCandidate);
  const normalizedPath = path && (path.includes('/') || path.includes('.') || path.startsWith('~')) ? path : '';
  const callId = extractFirstGeminiStringByKeys(records, [
    'callId',
    'call_id',
    'toolCallId',
    'tool_call_id',
    'call',
  ]);
  const sessionId = extractGeminiObservedSessionId(records)
    ?? (typeof params?.conversationId === 'string' && params.conversationId.trim() ? params.conversationId.trim() : undefined)
    ?? (typeof params?.threadId === 'string' && params.threadId.trim() ? params.threadId.trim() : undefined)
    ?? (typeof msg?.thread_id === 'string' && msg.thread_id.trim() ? msg.thread_id.trim() : undefined);
  const turnId = extractFirstGeminiStringByKeys(records, ['turnId', 'turn_id'])
    || (typeof params?.id === 'string' && params.id.trim() ? params.id.trim() : '')
    || sessionId
    || undefined;

  let action: GeminiActionEvent | undefined = extractStructuredGeminiAction(payload);
  let actionType: GeminiActionEvent['actionType'] | null = null;
  if (!action && seemsToolEvent && command && looksLikeShellCommand(command)) {
    actionType = inferActionTypeFromCommand(command);
  } else if (!action && seemsToolEvent && normalizedPath && /(write|patch|modify|edit|create|delete|update|changed)/i.test(lineLower)) {
    actionType = 'file_write';
  } else if (!action && seemsToolEvent && normalizedPath && /(read|open|inspect|view|cat|grep|sed -n)/i.test(lineLower)) {
    actionType = 'file_read';
  } else if (!action && seemsToolEvent && /(directory listing|file list|\bls\b|\btree\b|rg --files)/i.test(lineLower)) {
    actionType = 'file_list';
  }

  if (!action && actionType) {
    const resolvedPath = normalizedPath || extractPathFromCommand(command);
    action = {
      actionType,
      title: titleForActionType(actionType),
      callId: callId || undefined,
      command: command || undefined,
      path: resolvedPath || undefined,
      output: outputCandidate || undefined,
      additions: diffStats.additions,
      deletions: diffStats.deletions,
      hasDiffSignal: diffStats.hasDiffSignal,
    };
  }

  const assistantItemId = typeof msg?.item_id === 'string' && msg.item_id.trim()
    ? msg.item_id.trim()
    : typeof item?.id === 'string' && item.id.trim()
      ? item.id.trim()
      : undefined;
  const assistantIsDelta = (
    msgType === 'agent_message_content_delta'
    || (payloadType === 'message' && payload.delta === true)
  );
  const assistantText = (() => {
    if (method === 'codex/event/agent_message_content_delta' && typeof msg?.delta === 'string') {
      return msg.delta;
    }
    if (method === 'codex/event/agent_message' && typeof msg?.message === 'string') {
      return msg.message.trim();
    }
    if (method === 'item/completed' && itemType === 'agentmessage' && typeof item?.text === 'string') {
      return item.text.trim();
    }
    if (!isSystem && !seemsToolEvent && seemsAssistantEvent) {
      return extractFirstGeminiStringByKeys(records, ['text', 'message', 'content', 'output', 'result']);
    }
    return '';
  })();

  const envelopes: SessionProtocolEnvelope[] = [];
  if (isSystem && sessionId) {
    envelopes.push({
      kind: 'turn-start',
      provider: 'gemini',
      source: 'system',
      sessionId,
      ...(turnId ? { turnId } : {}),
      threadId: sessionId,
      threadIdSource: 'observed',
    });
  }
  if (action) {
    const toolCallId = action.callId?.trim() || buildActionEventKey(action);
    const toolName = buildToolName(action, payloadSubtype);
    envelopes.push({
      kind: 'tool-call-start',
      provider: 'gemini',
      source: 'tool',
      ...(sessionId ? { sessionId } : {}),
      ...(turnId ? { turnId } : {}),
      toolCallId,
      toolName,
      action,
    });
    envelopes.push({
      kind: 'tool-call-end',
      provider: 'gemini',
      source: 'tool',
      ...(sessionId ? { sessionId } : {}),
      ...(turnId ? { turnId } : {}),
      toolCallId,
      toolName,
      action,
      stopReason: 'completed',
    });
  }
  if (
    assistantText
    && !isGeminiCommentaryPhase(assistantPhase)
    && !assistantIsDelta
    && !looksLikeGeminiActionTranscript(assistantText)
    && (
      payloadType === 'result'
      || method === 'codex/event/agent_message'
      || (method === 'item/completed' && itemType === 'agentmessage')
      || payloadType === 'message'
      || !looksLikeShellCommand(assistantText)
    )
  ) {
    envelopes.push({
      kind: 'text',
      provider: 'gemini',
      source: payloadType === 'result' ? 'result' : 'assistant',
      ...(sessionId ? { sessionId } : {}),
      ...(turnId ? { turnId } : {}),
      text: assistantText,
    });
  }
  const stopReason = resolveStopReason(payloadType, payloadSubtype, payload);
  if (stopReason) {
    envelopes.push({
      kind: 'turn-end',
      provider: 'gemini',
      source: payloadType === 'result' ? 'result' : seemsToolEvent ? 'tool' : isSystem ? 'system' : 'assistant',
      ...(sessionId ? { sessionId } : {}),
      ...(turnId ? { turnId } : {}),
      ...(sessionId ? { threadId: sessionId, threadIdSource: 'observed' as const } : {}),
      stopReason,
    });
    envelopes.push({
      kind: 'stop',
      provider: 'gemini',
      source: payloadType === 'result' ? 'result' : seemsToolEvent ? 'tool' : isSystem ? 'system' : 'assistant',
      ...(sessionId ? { sessionId } : {}),
      ...(turnId ? { turnId } : {}),
      reason: stopReason,
    });
  }

  return {
    envelopes,
    ...(action ? { action, actionKey: buildActionEventKey(action) } : {}),
    ...(assistantText ? {
      assistantText,
      assistantSource: payloadType === 'result'
        ? 'result' as const
        : payloadType === 'message'
          ? 'message' as const
          : 'assistant' as const,
      ...(assistantPhase ? { assistantPhase } : {}),
      ...(assistantIsDelta ? { assistantIsDelta: true } : {}),
      ...(turnId ? { assistantTurnId: turnId } : {}),
      ...(assistantItemId ? { assistantItemId } : {}),
    } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export function mapGeminiStreamOutputToProtocol(stdout: string): { envelopes: SessionProtocolEnvelope[]; sessionId?: string } {
  const lines = stdout
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const envelopes: SessionProtocolEnvelope[] = [];
  const envelopeKeys = new Set<string>();
  const assistantState = createGeminiAssistantAccumulatorState();
  let latestSessionId = '';

  for (const [index, line] of lines.entries()) {
    const parsedLine = parseGeminiStreamLine(line);
    for (const envelope of parsedLine.envelopes) {
      const hydratedEnvelope = latestSessionId && !envelope.sessionId
        ? {
          ...envelope,
          sessionId: latestSessionId,
          ...(envelope.kind === 'turn-end' && !envelope.threadId
            ? { threadId: latestSessionId, threadIdSource: 'observed' as const }
            : {}),
        }
        : envelope;
      const envelopeKey = JSON.stringify(hydratedEnvelope);
      if (envelope.kind === 'text' || !envelopeKeys.has(envelopeKey)) {
        envelopes.push(hydratedEnvelope);
        envelopeKeys.add(envelopeKey);
      }
    }
    if (parsedLine.assistantText) {
      accumulateGeminiAssistantText(parsedLine, assistantState, index);
    }
    if (parsedLine.sessionId) {
      latestSessionId = parsedLine.sessionId;
    }
  }

  const latestAssistant = getLatestGeminiAssistantAggregate(assistantState);
  const normalizedAssistantText = sanitizeAgentMessageText(latestAssistant?.text ?? '');
  if (normalizedAssistantText && !envelopes.some((envelope) => envelope.kind === 'text')) {
    const synthesizedTextEnvelope: SessionProtocolEnvelope = {
      kind: 'text',
      provider: 'gemini',
      source: 'assistant',
      ...((latestAssistant?.sessionId ?? latestSessionId) ? { sessionId: latestAssistant?.sessionId ?? latestSessionId } : {}),
      ...(latestAssistant?.turnId ? { turnId: latestAssistant.turnId } : {}),
      text: normalizedAssistantText,
    };
    const insertIndex = envelopes.findIndex((envelope) => envelope.kind === 'turn-end' || envelope.kind === 'stop');
    if (insertIndex >= 0) {
      envelopes.splice(insertIndex, 0, synthesizedTextEnvelope);
    } else {
      envelopes.push(synthesizedTextEnvelope);
    }
  }

  return {
    envelopes,
    ...(latestSessionId ? { sessionId: latestSessionId } : {}),
  };
}

export function parseGeminiStreamOutput(stdout: string): {
  output: string;
  actions: GeminiActionEvent[];
  sessionId?: string;
  envelopes: SessionProtocolEnvelope[];
} {
  const lines = stdout
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const actionByKey = new Map<string, GeminiActionEvent>();
  const assistantState = createGeminiAssistantAccumulatorState();
  let latestSessionId = '';

  for (const [index, line] of lines.entries()) {
    const parsedLine = parseGeminiStreamLine(line);
    if (parsedLine.action && parsedLine.actionKey && !actionByKey.has(parsedLine.actionKey)) {
      actionByKey.set(parsedLine.actionKey, parsedLine.action);
    }
    const assistantText = parsedLine.assistantText ?? '';
    if (!assistantText) {
      if (parsedLine.sessionId) {
        latestSessionId = parsedLine.sessionId;
      }
      continue;
    }
    if (looksLikeGeminiActionTranscript(assistantText)) {
      if (parsedLine.sessionId) {
        latestSessionId = parsedLine.sessionId;
      }
      continue;
    }
    if (
      parsedLine.assistantIsDelta
      && (
        parsedLine.assistantSource === 'assistant'
        || parsedLine.assistantSource === 'message'
      )
    ) {
      accumulateGeminiAssistantText(parsedLine, assistantState, index);
    } else if (
      !looksLikeShellCommand(assistantText)
      && (
        parsedLine.assistantSource === 'result'
        || parsedLine.assistantSource === 'message'
        || parsedLine.assistantSource === 'assistant'
      )
    ) {
      accumulateGeminiAssistantText(parsedLine, assistantState, index);
    }
    if (parsedLine.sessionId) {
      latestSessionId = parsedLine.sessionId;
    }
  }

  const mapped = mapGeminiStreamOutputToProtocol(stdout);
  const latestAssistant = getLatestGeminiAssistantAggregate(assistantState);

  return {
    output: sanitizeAgentMessageText(latestAssistant?.text ?? ''),
    actions: [...actionByKey.values()],
    envelopes: mapped.envelopes,
    ...(latestSessionId ? { sessionId: latestSessionId } : {}),
  };
}
