import { inferActionTypeFromCommand, titleForActionType } from '../../actionType.js';
import { sanitizeAgentMessageText } from '../../agentMessageSanitizer.js';
import { summarizeDiffText } from '../../diffStats.js';
import type { SessionProtocolEnvelope, SessionProtocolStopReason } from '../../contracts/sessionProtocol.js';
import { collectClaudeNestedRecords, extractClaudeObservedSessionId, extractFirstClaudeStringByKeys, parseClaudeJsonLine } from './claudeProtocolFields.js';
import type { ClaudeActionEvent } from './types.js';

type ClaudeMappedLine = {
  envelopes: SessionProtocolEnvelope[];
  action?: ClaudeActionEvent;
  actionKey?: string;
  assistantText?: string;
  assistantSource?: 'assistant' | 'result';
  errorText?: string;
  sessionId?: string;
};

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

export function looksLikeClaudeActionTranscript(value: string): boolean {
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

function buildActionEventKey(action: ClaudeActionEvent): string {
  const callId = action.callId?.trim() ?? '';
  const command = action.command?.trim() ?? '';
  const path = action.path?.trim() ?? '';
  if (callId) {
    return `${action.actionType}|${callId}`;
  }
  return `${action.actionType}|${command}|${path}`;
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

function extractClaudeErrorText(
  payloadType: string,
  payloadSubtype: string,
  payload: Record<string, unknown>,
  records: Record<string, unknown>[],
): string {
  const normalizedStopReason = String(payload.stop_reason ?? payload.stopReason ?? payload.reason ?? '').trim().toLowerCase();
  const looksLikeError = (
    payloadType === 'error'
    || payloadSubtype.includes('error')
    || normalizedStopReason.includes('error')
  );
  if (!looksLikeError) {
    return '';
  }

  return extractFirstClaudeStringByKeys(records, [
    'message',
    'error',
    'details',
    'text',
    'content',
    'result',
    'output',
  ]);
}

function buildToolName(action: ClaudeActionEvent, payloadSubtype: string): string {
  if (payloadSubtype) {
    return payloadSubtype;
  }
  if (action.command) {
    return action.command.split(/\s+/)[0] || action.actionType;
  }
  return action.actionType;
}

export function parseClaudeStreamLine(line: string): ClaudeMappedLine {
  const payload = parseClaudeJsonLine(line);
  if (!payload) {
    return { envelopes: [] };
  }

  const payloadType = String(payload.type ?? '').trim().toLowerCase();
  const payloadSubtype = String(payload.subtype ?? '').trim().toLowerCase();
  const lineLower = line.toLowerCase();
  const isSystem = payloadType === 'system' || payloadSubtype === 'init';
  const seemsToolEvent = (
    payloadType === 'tool'
    || payloadSubtype.includes('tool')
    || lineLower.includes('"tool')
    || lineLower.includes('commandexecution')
    || lineLower.includes('exec_command')
    || lineLower.includes('file_change')
    || lineLower.includes('filechange')
  );
  const seemsAssistantEvent = (
    payloadType.includes('assistant')
    || payloadSubtype.includes('assistant')
    || payloadSubtype.includes('final')
    || payloadType === 'result'
    || lineLower.includes('"agent_message"')
  );
  const records = collectClaudeNestedRecords(payload);
  const commandRaw = extractFirstClaudeStringByKeys(records, [
    'command',
    'cmd',
    'parsed_cmd',
    'shellCommand',
    'shell_command',
  ]);
  const command = commandRaw ? unwrapShellCommand(commandRaw) : '';
  const path = extractFirstClaudeStringByKeys(records, [
    'path',
    'filePath',
    'file_path',
    'targetPath',
    'target_path',
  ]);
  const outputCandidate = extractFirstClaudeStringByKeys(records, [
    'aggregatedOutput',
    'aggregated_output',
    'output',
    'stdout',
    'result',
    'text',
  ]);
  const diffStats = summarizeDiffText(outputCandidate);
  const normalizedPath = path && (path.includes('/') || path.includes('.') || path.startsWith('~')) ? path : '';
  const callId = extractFirstClaudeStringByKeys(records, [
    'callId',
    'call_id',
    'toolCallId',
    'tool_call_id',
    'call',
  ]);
  const sessionId = extractClaudeObservedSessionId(records);
  const turnId = sessionId || extractFirstClaudeStringByKeys(records, ['turnId', 'turn_id']) || undefined;
  const errorText = extractClaudeErrorText(payloadType, payloadSubtype, payload, records);

  let action: ClaudeActionEvent | undefined;
  let actionType: ClaudeActionEvent['actionType'] | null = null;
  if (seemsToolEvent && command && looksLikeShellCommand(command)) {
    actionType = inferActionTypeFromCommand(command);
  } else if (seemsToolEvent && normalizedPath && /(write|patch|modify|edit|create|delete|update|changed)/i.test(lineLower)) {
    actionType = 'file_write';
  } else if (seemsToolEvent && normalizedPath && /(read|open|inspect|view|cat|grep|sed -n)/i.test(lineLower)) {
    actionType = 'file_read';
  } else if (seemsToolEvent && /(directory listing|file list|\bls\b|\btree\b|rg --files)/i.test(lineLower)) {
    actionType = 'file_list';
  }

  if (actionType) {
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

  const assistantText = (!errorText && !isSystem && !seemsToolEvent && seemsAssistantEvent)
    ? extractFirstClaudeStringByKeys(records, ['text', 'message', 'content', 'output', 'result'])
    : '';

  const envelopes: SessionProtocolEnvelope[] = [];
  if (isSystem && sessionId) {
    envelopes.push({
      kind: 'turn-start',
      provider: 'claude',
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
      provider: 'claude',
      source: 'tool',
      ...(sessionId ? { sessionId } : {}),
      ...(turnId ? { turnId } : {}),
      toolCallId,
      toolName,
      action,
    });
    envelopes.push({
      kind: 'tool-call-end',
      provider: 'claude',
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
    && !looksLikeClaudeActionTranscript(assistantText)
    && (
      payloadType === 'result'
      || !looksLikeShellCommand(assistantText)
    )
  ) {
    envelopes.push({
      kind: 'text',
      provider: 'claude',
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
      provider: 'claude',
      source: payloadType === 'result' ? 'result' : seemsToolEvent ? 'tool' : isSystem ? 'system' : 'assistant',
      ...(sessionId ? { sessionId } : {}),
      ...(turnId ? { turnId } : {}),
      ...(sessionId ? { threadId: sessionId, threadIdSource: 'observed' as const } : {}),
      stopReason,
    });
    envelopes.push({
      kind: 'stop',
      provider: 'claude',
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
      assistantSource: payloadType === 'result' ? 'result' as const : 'assistant' as const,
    } : {}),
    ...(errorText ? { errorText } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

export function mapClaudeStreamOutputToProtocol(stdout: string): { envelopes: SessionProtocolEnvelope[]; sessionId?: string } {
  const lines = stdout
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const envelopes: SessionProtocolEnvelope[] = [];
  const envelopeKeys = new Set<string>();
  let latestSessionId = '';

  for (const line of lines) {
    const parsedLine = parseClaudeStreamLine(line);
    for (const envelope of parsedLine.envelopes) {
      const envelopeKey = JSON.stringify(envelope);
      if (envelope.kind === 'text' || !envelopeKeys.has(envelopeKey)) {
        envelopes.push(envelope);
        envelopeKeys.add(envelopeKey);
      }
    }
    if (parsedLine.sessionId) {
      latestSessionId = parsedLine.sessionId;
    }
  }

  return {
    envelopes,
    ...(latestSessionId ? { sessionId: latestSessionId } : {}),
  };
}

export function parseClaudeStreamOutput(stdout: string): {
  output: string;
  actions: ClaudeActionEvent[];
  errorText?: string;
  sessionId?: string;
  envelopes: SessionProtocolEnvelope[];
} {
  const lines = stdout
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const actionByKey = new Map<string, ClaudeActionEvent>();
  let latestAssistantText = '';
  let latestErrorText = '';
  let latestSessionId = '';

  for (const line of lines) {
    const parsedLine = parseClaudeStreamLine(line);
    if (parsedLine.action && parsedLine.actionKey && !actionByKey.has(parsedLine.actionKey)) {
      actionByKey.set(parsedLine.actionKey, parsedLine.action);
    }
    const assistantText = parsedLine.assistantText
      ? sanitizeAgentMessageText(parsedLine.assistantText)
      : '';
    if (
      assistantText
      && (
        !looksLikeClaudeActionTranscript(assistantText)
        && (
          parsedLine.assistantSource === 'result'
          || !looksLikeShellCommand(assistantText)
        )
      )
      && assistantText.length >= latestAssistantText.length
    ) {
      latestAssistantText = assistantText;
    }
    if (parsedLine.errorText) {
      latestErrorText = sanitizeAgentMessageText(parsedLine.errorText);
    }
    if (parsedLine.sessionId) {
      latestSessionId = parsedLine.sessionId;
    }
  }

  const mapped = mapClaudeStreamOutputToProtocol(stdout);

  return {
    output: latestAssistantText,
    actions: [...actionByKey.values()],
    envelopes: mapped.envelopes,
    ...(latestErrorText ? { errorText: latestErrorText } : {}),
    ...(latestSessionId ? { sessionId: latestSessionId } : {}),
  };
}
