import { inferActionTypeFromCommand, titleForActionType } from '../../actionType.js';
import { sanitizeAgentMessageText } from '../../agentMessageSanitizer.js';
import { summarizeDiffText } from '../../diffStats.js';
import type { SessionProtocolEnvelope } from '../../contracts/sessionProtocol.js';
import {
  collectGeminiNestedRecords,
  extractFirstGeminiStringByKeys,
  extractGeminiObservedSessionId,
  parseGeminiJsonLine,
} from './geminiProtocolFields.js';
import type {
  GeminiCanonicalEvent,
  GeminiCanonicalTextCompletedEvent,
  GeminiCanonicalTextDeltaEvent,
} from './geminiCanonicalEvents.js';
import { normalizeGeminiMessagePhase } from './geminiCanonicalEvents.js';
import { GeminiIdentityAssembler } from './geminiIdentityAssembler.js';
import type { GeminiActionEvent } from './types.js';

type GeminiTextAggregate = {
  key: string;
  text: string;
  updatedAt: number;
  threadId?: string;
  turnId?: string;
  itemId?: string;
};

type GeminiPendingTextBlock = {
  itemId: string;
  text: string;
  source: 'assistant';
  phase?: GeminiCanonicalTextDeltaEvent['phase'];
  threadId?: string;
  turnId?: string;
  rawLine: string;
};

type GeminiPendingToolCall = {
  callId: string;
  action: GeminiActionEvent;
  threadId?: string;
  turnId?: string;
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

function buildActionEventKey(action: GeminiActionEvent): string {
  const callId = action.callId?.trim() ?? '';
  const command = action.command?.trim() ?? '';
  const path = action.path?.trim() ?? '';
  if (callId) {
    return `${action.actionType}|${callId}`;
  }
  return `${action.actionType}|${command}|${path}`;
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

function resolveStopReason(payloadType: string, payloadSubtype: string, payload: Record<string, unknown>): 'completed' | 'aborted' | 'timeout' | 'error' | undefined {
  if (payloadType === 'tool_use' || payloadType === 'tool_result') {
    return undefined;
  }
  const normalizedStopReason = String(payload.stop_reason ?? payload.stopReason ?? payload.reason ?? payload.status ?? '').trim().toLowerCase();
  if (normalizedStopReason.includes('abort') || payloadSubtype.includes('abort')) {
    return 'aborted';
  }
  if (normalizedStopReason.includes('timeout')) {
    return 'timeout';
  }
  if (normalizedStopReason.includes('error') || payloadType === 'error') {
    return 'error';
  }
  if (
    payloadType === 'result'
    || payloadSubtype.includes('final')
    || normalizedStopReason === 'success'
    || normalizedStopReason === 'completed'
  ) {
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

function normalizeAssistantContent(value: unknown): string {
  if (typeof value === 'string') {
    return value.trim();
  }
  if (!Array.isArray(value)) {
    return '';
  }
  const parts = value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry))
    .map((entry) => typeof entry.text === 'string' ? entry.text : '')
    .filter(Boolean);
  return parts.join('').trim();
}

function extractGeminiCommand(records: Record<string, unknown>[]): string {
  for (const key of ['command', 'cmd', 'shellCommand', 'shell_command']) {
    for (const record of records) {
      const value = record[key];
      if (typeof value === 'string' && value.trim()) {
        return unwrapShellCommand(value);
      }
      if (Array.isArray(value)) {
        const parts = value.filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0);
        if (parts.length > 0) {
          return unwrapShellCommand(parts.join(' '));
        }
      }
    }
  }
  return '';
}

type GeminiStreamSummary = {
  events: GeminiCanonicalEvent[];
  actions: GeminiActionEvent[];
  output: string;
  sessionId?: string;
  envelopes: SessionProtocolEnvelope[];
  outputThreadId?: string;
  outputTurnId?: string;
  outputItemId?: string;
  errorText?: string;
};

export class GeminiStreamAdapter {
  private readonly assembler = new GeminiIdentityAssembler();
  private readonly emittedKeys = new Set<string>();
  private readonly actionsByKey = new Map<string, GeminiActionEvent>();
  private readonly textAggregates = new Map<string, GeminiTextAggregate>();
  private readonly pendingToolCalls = new Map<string, GeminiPendingToolCall>();
  private readonly completedTexts: GeminiCanonicalTextCompletedEvent[] = [];
  private readonly events: GeminiCanonicalEvent[] = [];
  private latestThreadId?: string;
  private sequence = 0;
  private errorText?: string;
  private pendingTextBlock: GeminiPendingTextBlock | null = null;
  private syntheticItemSequence = 0;

  processLine(line: string): GeminiCanonicalEvent[] {
    const payload = parseGeminiJsonLine(line);
    if (!payload) {
      return [];
    }

    const params = asRecord(payload.params);
    const msg = asRecord(params?.msg);
    const item = asRecord(params?.item);
    const method = String(payload.method ?? '').trim().toLowerCase();
    const payloadType = String(payload.type ?? '').trim().toLowerCase();
    const payloadSubtype = String(payload.subtype ?? '').trim().toLowerCase();
    const records = collectGeminiNestedRecords(payload);
    const role = extractFirstGeminiStringByKeys(records, ['role']).toLowerCase();
    const msgType = String(msg?.type ?? '').trim().toLowerCase();
    const itemType = String(item?.type ?? '').trim().toLowerCase();
    const phase = normalizeGeminiMessagePhase(msg?.phase ?? item?.phase ?? payloadSubtype);
    const threadId = extractGeminiObservedSessionId(records)
      ?? (typeof params?.conversationId === 'string' && params.conversationId.trim() ? params.conversationId.trim() : undefined)
      ?? (typeof params?.threadId === 'string' && params.threadId.trim() ? params.threadId.trim() : undefined)
      ?? (typeof msg?.thread_id === 'string' && msg.thread_id.trim() ? msg.thread_id.trim() : undefined);
    const turnId = extractFirstGeminiStringByKeys(records, ['turnId', 'turn_id'])
      || (typeof params?.id === 'string' && params.id.trim() ? params.id.trim() : '')
      || undefined;
    const itemId = typeof msg?.item_id === 'string' && msg.item_id.trim()
      ? msg.item_id.trim()
      : typeof params?.itemId === 'string' && params.itemId.trim()
        ? params.itemId.trim()
        : typeof item?.id === 'string' && item.id.trim()
          ? item.id.trim()
          : undefined;
    const events: GeminiCanonicalEvent[] = [];

    if (threadId) {
      this.latestThreadId = threadId;
    }

    if (
      payloadType === 'system'
      || payloadType === 'init'
      || payloadSubtype === 'init'
    ) {
      events.push({
        type: 'turn_started',
        threadId,
        turnId,
        rawLine: line,
      });
    }

    const structuredAction = extractStructuredGeminiAction(payload);
    const command = extractGeminiCommand(records);
    const path = extractFirstGeminiStringByKeys(records, ['path', 'filePath', 'file_path', 'targetPath', 'target_path']);
    const outputCandidate = extractFirstGeminiStringByKeys(records, ['aggregatedOutput', 'aggregated_output', 'output', 'stdout', 'result', 'text']);
    const diffStats = summarizeDiffText(outputCandidate);
    const resolvedPath = path || extractPathFromCommand(command);
    const callId = extractFirstGeminiStringByKeys(records, ['callId', 'call_id', 'toolCallId', 'tool_call_id', 'call'])
      || (structuredAction?.callId ?? '')
      || undefined;
    const lineLower = line.toLowerCase();
    const seemsToolPayload = (
      Boolean(structuredAction)
      || payloadType === 'tool'
      || payloadType === 'tool_use'
      || payloadType === 'tool_result'
      || payloadSubtype.includes('tool')
      || method.includes('exec_command')
      || method === 'item/started'
      || method === 'item/completed'
      || itemType === 'commandexecution'
      || itemType === 'filechange'
    );
    let action = structuredAction;
    if (!action && payloadType === 'tool_use') {
      action = this.buildGeminiToolActionFromToolUse(payload, records);
    }
    if (!action && payloadType === 'tool_result') {
      action = this.buildGeminiToolActionFromToolResult(payload, records);
    }

    const deltaText = (() => {
      if (method === 'codex/event/agent_message_content_delta' && typeof msg?.delta === 'string') {
        return msg.delta;
      }
      if (method === 'codex/event/agent_message_delta' && typeof msg?.delta === 'string') {
        return msg.delta;
      }
      if (method === 'item/agentmessage/delta' && typeof params?.delta === 'string') {
        return params.delta;
      }
      if (payloadType === 'message' && role === 'assistant' && payload.delta === true) {
        return normalizeAssistantContent(payload.content);
      }
      return '';
    })();
    const safeDeltaText = !looksLikeGeminiActionTranscript(deltaText) ? deltaText : '';
    const completedText = (() => {
      if (method === 'item/completed' && itemType === 'agentmessage' && typeof item?.text === 'string') {
        return item.text.trim();
      }
      if (method === 'codex/event/agent_message' && typeof msg?.message === 'string') {
        return msg.message.trim();
      }
      if (payloadType === 'message' && role === 'assistant' && payload.delta !== true) {
        return normalizeAssistantContent(payload.content);
      }
      if (payloadType === 'event' && String(payload.event ?? '').trim().toLowerCase() === 'agent_message') {
        return normalizeAssistantContent(payload.content);
      }
      if (payloadType === 'result') {
        const resultText = extractFirstGeminiStringByKeys(records, ['result', 'output', 'text', 'content']);
        if (resultText && !looksLikeGeminiActionTranscript(resultText) && !looksLikeShellCommand(resultText)) {
          return resultText;
        }
      }
      return '';
    })();
    const stopReason = resolveStopReason(payloadType, payloadSubtype, payload);

    if (!safeDeltaText) {
      if (completedText) {
        this.discardPendingTextBlockIfSameContext({
          threadId,
          turnId,
          itemId,
        });
      }
      if (stopReason === 'aborted' || stopReason === 'timeout' || stopReason === 'error') {
        this.pendingTextBlock = null;
      } else {
        const flushed = this.flushPendingTextBlock();
        if (flushed) {
          events.push(flushed);
        }
      }
    }

    if (!action && seemsToolPayload && command && looksLikeShellCommand(command)) {
      const actionType = inferActionTypeFromCommand(command);
      action = {
        actionType,
        title: titleForActionType(actionType),
        ...(callId ? { callId } : {}),
        ...(command ? { command } : {}),
        ...(resolvedPath ? { path: resolvedPath } : {}),
        ...(outputCandidate ? { output: outputCandidate } : {}),
        additions: diffStats.additions,
        deletions: diffStats.deletions,
        hasDiffSignal: diffStats.hasDiffSignal,
      };
    } else if (!action && seemsToolPayload && resolvedPath) {
      const actionType = /(write|patch|modify|edit|create|delete|update|changed)/i.test(lineLower)
        ? 'file_write'
        : /(read|open|inspect|view|cat|grep|sed -n)/i.test(lineLower)
          ? 'file_read'
          : /(directory listing|file list|\bls\b|\btree\b|rg --files)/i.test(lineLower)
            ? 'file_list'
            : null;
      if (actionType) {
        action = {
          actionType,
          title: titleForActionType(actionType),
          ...(callId ? { callId } : {}),
          ...(command ? { command } : {}),
          path: resolvedPath,
          ...(outputCandidate ? { output: outputCandidate } : {}),
          additions: diffStats.additions,
          deletions: diffStats.deletions,
          hasDiffSignal: diffStats.hasDiffSignal,
        };
      }
    }

    if (action) {
      const resolvedCallId = callId ?? action.callId;
      const toolName = payloadType === 'tool_use' || payloadType === 'tool_result'
        ? this.resolveGeminiToolName(payload, records)
        : buildToolName(action, payloadSubtype);
      const isStarted = (
        method === 'item/started'
        || method === 'codex/event/exec_command_begin'
        || payloadType === 'tool_use'
      );
      const isCompleted = (
        method === 'item/completed'
        || method === 'codex/event/exec_command_end'
        || payloadType === 'tool_result'
      );
      if (isStarted || payloadType === 'tool') {
        if (resolvedCallId && isStarted) {
          this.pendingToolCalls.set(resolvedCallId, {
            callId: resolvedCallId,
            action: {
              ...action,
              ...(resolvedCallId ? { callId: resolvedCallId } : {}),
            },
            threadId,
            turnId,
          });
        }
        events.push({
          type: 'tool_started',
          threadId,
          turnId,
          callId: resolvedCallId,
          rawLine: line,
          action,
          toolName,
        });
      }
      if (isCompleted || payloadType === 'tool') {
        const completedAction = resolvedCallId
          ? this.pendingToolCalls.get(resolvedCallId)?.action ?? action
          : action;
        if (resolvedCallId) {
          this.pendingToolCalls.delete(resolvedCallId);
        }
        events.push({
          type: 'tool_completed',
          threadId,
          turnId,
          callId: resolvedCallId,
          rawLine: line,
          action: completedAction,
          toolName,
          stopReason: this.resolveToolStopReason(payload),
        });
      }
    }

    if (safeDeltaText) {
      const pendingBlock = this.startOrContinuePendingTextBlock({
        threadId,
        turnId,
        itemId,
        phase,
        rawLine: line,
      });
      pendingBlock.text += deltaText;
      events.push({
        type: 'text_delta',
        threadId: pendingBlock.threadId,
        turnId: pendingBlock.turnId,
        itemId: pendingBlock.itemId,
        phase: pendingBlock.phase,
        rawLine: line,
        source: pendingBlock.source,
        text: safeDeltaText,
      });
    }

    if (completedText) {
      events.push({
        type: 'text_completed',
        threadId,
        turnId,
        itemId,
        phase: phase ?? (payloadType === 'result' ? 'result' : undefined),
        rawLine: line,
        source: payloadType === 'result' ? 'result' : 'assistant',
        text: sanitizeAgentMessageText(completedText),
      });
    }

    if (stopReason === 'completed') {
      events.push({
        type: 'turn_completed',
        threadId,
        turnId,
        rawLine: line,
        stopReason: 'completed',
      });
    } else if (stopReason === 'aborted' || stopReason === 'timeout') {
      events.push({
        type: 'turn_aborted',
        threadId,
        turnId,
        rawLine: line,
        stopReason,
      });
    } else if (stopReason === 'error') {
      const errorText = extractFirstGeminiStringByKeys(records, ['error', 'message', 'stderr', 'text']);
      this.errorText ||= errorText || 'Unknown Gemini error';
      events.push({
        type: 'turn_failed',
        threadId,
        turnId,
        rawLine: line,
        stopReason: 'error',
        ...(this.errorText ? { errorText: this.errorText } : {}),
      });
    }

    const hydrated = events
      .map((event) => this.assembler.hydrate(event))
      .filter((event) => this.acceptEvent(event));

    for (const event of hydrated) {
      this.events.push(event);
      this.sequence += 1;
      if (event.type === 'tool_started' || event.type === 'tool_completed') {
        this.actionsByKey.set(buildActionEventKey(event.action), event.action);
      }
      if (event.type === 'text_delta') {
        this.recordDelta(event);
      }
      if (event.type === 'text_completed') {
        this.completedTexts.push(event);
        this.recordCompleted(event);
      }
    }

    return hydrated;
  }

  summarize(): GeminiStreamSummary {
    return {
      events: [...this.events],
      actions: [...this.actionsByKey.values()],
      output: this.resolveOutput(),
      ...(this.latestThreadId ? { sessionId: this.latestThreadId } : {}),
      envelopes: [],
      ...this.resolveOutputContext(),
      ...(this.errorText ? { errorText: this.errorText } : {}),
    };
  }

  private acceptEvent(event: GeminiCanonicalEvent): boolean {
    const key = (() => {
      switch (event.type) {
        case 'text_delta':
        case 'text_completed':
          return [
            event.type,
            event.threadId ?? '',
            event.turnId ?? '',
            event.itemId ?? '',
            event.phase ?? '',
            event.text,
          ].join('|');
        case 'tool_started':
        case 'tool_completed':
          return [
            event.type,
            event.threadId ?? '',
            event.turnId ?? '',
            event.callId ?? '',
            event.action.command ?? '',
            event.action.path ?? '',
          ].join('|');
        case 'turn_started':
          return [event.type, event.threadId ?? '', event.turnId ?? ''].join('|');
        case 'turn_completed':
        case 'turn_aborted':
        case 'turn_failed':
          return [event.type, event.threadId ?? '', event.turnId ?? '', event.stopReason].join('|');
        case 'permission_requested':
          return [event.type, event.threadId ?? '', event.turnId ?? '', event.callId ?? '', event.command].join('|');
      }
    })();
    if (this.emittedKeys.has(key)) {
      return false;
    }
    this.emittedKeys.add(key);
    return true;
  }

  private recordDelta(event: GeminiCanonicalTextDeltaEvent): void {
    const key = event.itemId ? `item:${event.itemId}` : event.turnId ? `turn:${event.turnId}` : `thread:${event.threadId ?? 'unknown'}`;
    const existing = this.textAggregates.get(key);
    this.textAggregates.set(key, {
      key,
      text: `${existing?.text ?? ''}${event.text}`,
      updatedAt: this.sequence,
      threadId: event.threadId ?? existing?.threadId,
      turnId: event.turnId ?? existing?.turnId,
      itemId: event.itemId ?? existing?.itemId,
    });
  }

  private recordCompleted(event: GeminiCanonicalTextCompletedEvent): void {
    const key = event.itemId ? `item:${event.itemId}` : event.turnId ? `turn:${event.turnId}` : `thread:${event.threadId ?? 'unknown'}`;
    this.textAggregates.set(key, {
      key,
      text: event.text,
      updatedAt: this.sequence,
      threadId: event.threadId,
      turnId: event.turnId,
      itemId: event.itemId,
    });
  }

  private resolveOutput(): string {
    const latestCompleted = this.completedTexts[this.completedTexts.length - 1];
    if (latestCompleted?.text) {
      return latestCompleted.text;
    }
    const latestTerminalEvent = [...this.events].reverse().find((event) => (
      event.type === 'turn_aborted' || event.type === 'turn_failed'
    ));
    if (latestTerminalEvent) {
      return '';
    }
    let latestAggregate: GeminiTextAggregate | undefined;
    for (const aggregate of this.textAggregates.values()) {
      if (!latestAggregate || aggregate.updatedAt >= latestAggregate.updatedAt) {
        latestAggregate = aggregate;
      }
    }
    return sanitizeAgentMessageText(latestAggregate?.text ?? '');
  }

  private resolveOutputContext(): Pick<GeminiStreamSummary, 'outputThreadId' | 'outputTurnId' | 'outputItemId'> {
    const latestCompleted = this.completedTexts[this.completedTexts.length - 1];
    if (latestCompleted) {
      return {
        ...(latestCompleted.threadId ? { outputThreadId: latestCompleted.threadId } : {}),
        ...(latestCompleted.turnId
          ? { outputTurnId: latestCompleted.turnId }
          : latestCompleted.threadId
            ? { outputTurnId: latestCompleted.threadId }
            : {}),
        ...(latestCompleted.itemId ? { outputItemId: latestCompleted.itemId } : {}),
      };
    }
    let latestAggregate: GeminiTextAggregate | undefined;
    for (const aggregate of this.textAggregates.values()) {
      if (!latestAggregate || aggregate.updatedAt >= latestAggregate.updatedAt) {
        latestAggregate = aggregate;
      }
    }
    return {
      ...(latestAggregate?.threadId ? { outputThreadId: latestAggregate.threadId } : {}),
      ...(latestAggregate?.turnId
        ? { outputTurnId: latestAggregate.turnId }
        : latestAggregate?.threadId
          ? { outputTurnId: latestAggregate.threadId }
          : {}),
      ...(latestAggregate?.itemId ? { outputItemId: latestAggregate.itemId } : {}),
    };
  }

  private startOrContinuePendingTextBlock(input: {
    threadId?: string;
    turnId?: string;
    itemId?: string;
    phase?: GeminiCanonicalTextDeltaEvent['phase'];
    rawLine: string;
  }): GeminiPendingTextBlock {
    const matchesExisting = this.pendingTextBlock
      && this.pendingTextBlock.threadId === input.threadId
      && this.pendingTextBlock.turnId === input.turnId
      && this.pendingTextBlock.phase === input.phase
      && (!input.itemId || this.pendingTextBlock.itemId === input.itemId);
    if (matchesExisting && this.pendingTextBlock) {
      this.pendingTextBlock.rawLine = input.rawLine;
      return this.pendingTextBlock;
    }

    const itemId = input.itemId?.trim()
      || `gemini-msg-${++this.syntheticItemSequence}`;
    this.pendingTextBlock = {
      itemId,
      text: '',
      source: 'assistant',
      phase: input.phase,
      threadId: input.threadId,
      turnId: input.turnId,
      rawLine: input.rawLine,
    };
    return this.pendingTextBlock;
  }

  private flushPendingTextBlock(): GeminiCanonicalTextCompletedEvent | null {
    const pending = this.pendingTextBlock;
    if (!pending) {
      return null;
    }
    this.pendingTextBlock = null;
    const text = sanitizeAgentMessageText(pending.text);
    if (!text) {
      return null;
    }
    return {
      type: 'text_completed',
      threadId: pending.threadId,
      turnId: pending.turnId,
      itemId: pending.itemId,
      phase: pending.phase,
      rawLine: pending.rawLine,
      source: pending.source,
      text,
    };
  }

  private discardPendingTextBlockIfSameContext(input: {
    threadId?: string;
    turnId?: string;
    itemId?: string;
  }): void {
    const pending = this.pendingTextBlock;
    if (!pending) {
      return;
    }
    const sameThread = (pending.threadId ?? '') === (input.threadId ?? '');
    const sameTurn = (pending.turnId ?? '') === (input.turnId ?? '');
    const sameItem = input.itemId ? pending.itemId === input.itemId : true;
    if (!sameThread || !sameTurn || !sameItem) {
      return;
    }
    this.pendingTextBlock = null;
  }

  private resolveGeminiToolName(
    payload: Record<string, unknown>,
    records: Record<string, unknown>[],
  ): string {
    const direct = String(payload.tool_name ?? payload.toolName ?? '').trim();
    if (direct) {
      return direct;
    }
    return extractFirstGeminiStringByKeys(records, ['tool_name', 'toolName', 'name']) || 'tool';
  }

  private buildGeminiToolActionFromToolUse(
    payload: Record<string, unknown>,
    records: Record<string, unknown>[],
  ): GeminiActionEvent | undefined {
    const toolName = this.resolveGeminiToolName(payload, records).toLowerCase();
    const params = asRecord(payload.parameters);
    const callId = String(payload.tool_id ?? payload.toolId ?? '').trim() || undefined;
    const filePath = String(
      params?.file_path
      ?? params?.path
      ?? params?.target_path
      ?? '',
    ).trim();
    const command = String(params?.command ?? params?.cmd ?? '').trim();
    if (toolName === 'read_file') {
      return {
        actionType: 'file_read',
        title: titleForActionType('file_read'),
        ...(callId ? { callId } : {}),
        ...(filePath ? { path: filePath } : {}),
        additions: 0,
        deletions: 0,
        hasDiffSignal: false,
      };
    }
    if (toolName === 'write_file' || toolName === 'edit_file') {
      return {
        actionType: 'file_write',
        title: titleForActionType('file_write'),
        ...(callId ? { callId } : {}),
        ...(filePath ? { path: filePath } : {}),
        additions: 0,
        deletions: 0,
        hasDiffSignal: false,
      };
    }
    if (toolName === 'list_directory' || toolName === 'glob') {
      return {
        actionType: 'file_list',
        title: titleForActionType('file_list'),
        ...(callId ? { callId } : {}),
        ...(filePath ? { path: filePath } : {}),
        additions: 0,
        deletions: 0,
        hasDiffSignal: false,
      };
    }
    if (toolName === 'run_shell_command' && command) {
      const actionType = inferActionTypeFromCommand(command);
      return {
        actionType,
        title: titleForActionType(actionType),
        ...(callId ? { callId } : {}),
        command: unwrapShellCommand(command),
        ...(filePath ? { path: filePath } : {}),
        additions: 0,
        deletions: 0,
        hasDiffSignal: false,
      };
    }
    return undefined;
  }

  private buildGeminiToolActionFromToolResult(
    payload: Record<string, unknown>,
    records: Record<string, unknown>[],
  ): GeminiActionEvent | undefined {
    const callId = String(payload.tool_id ?? payload.toolId ?? '').trim();
    const output = extractFirstGeminiStringByKeys(records, ['output', 'text', 'result']);
    const diffStats = summarizeDiffText(output);
    const existing = callId ? this.pendingToolCalls.get(callId) : undefined;
    if (existing) {
      return {
        ...existing.action,
        ...(output ? { output } : {}),
        additions: diffStats.additions,
        deletions: diffStats.deletions,
        hasDiffSignal: diffStats.hasDiffSignal,
      };
    }
    return undefined;
  }

  private resolveToolStopReason(payload: Record<string, unknown>): 'completed' | 'aborted' | 'timeout' | 'error' {
    const status = String(payload.status ?? payload.stopReason ?? '').trim().toLowerCase();
    if (status.includes('abort')) {
      return 'aborted';
    }
    if (status.includes('timeout')) {
      return 'timeout';
    }
    if (status.includes('error') || status.includes('fail')) {
      return 'error';
    }
    return 'completed';
  }
}

export function parseGeminiStreamToCanonicalEvents(stdout: string): GeminiCanonicalEvent[] {
  const adapter = new GeminiStreamAdapter();
  for (const line of stdout.replace(/\r\n/g, '\n').split('\n').map((entry) => entry.trim()).filter(Boolean)) {
    adapter.processLine(line);
  }
  return adapter.summarize().events;
}
