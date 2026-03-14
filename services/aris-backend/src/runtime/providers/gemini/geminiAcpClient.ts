import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline';
import { spawn, type ChildProcess } from 'node:child_process';
import type {
  ApprovalPolicy,
  GeminiCapabilityOption,
  GeminiSessionCapabilities,
  PermissionDecision,
} from '../../../types.js';
import { inferActionTypeFromCommand, titleForActionType } from '../../actionType.js';
import { sanitizeAgentMessageText } from '../../agentMessageSanitizer.js';
import { summarizeDiffText, summarizeFileChangeDiff } from '../../diffStats.js';
import type { ProviderActionEvent, ProviderPermissionRequest, ProviderTextEvent } from '../../contracts/providerRuntime.js';
import type {
  SessionProtocolEnvelope,
  SessionProtocolStopReason,
} from '../../contracts/sessionProtocol.js';
import type { GeminiTurnResult } from './types.js';

type JsonRpcId = string | number | null;

type GeminiAcpLaunchCommand = {
  command: string;
  args: string[];
  env?: NodeJS.ProcessEnv;
};

type GeminiAcpClientOptions = {
  cwd: string;
  prompt: string;
  approvalPolicy: ApprovalPolicy;
  model?: string;
  mode?: string;
  preferredSessionId?: string;
  signal?: AbortSignal;
  onAction?: (action: ProviderActionEvent, meta: { threadId: string }) => Promise<void>;
  onText?: (event: ProviderTextEvent, meta: { threadId: string }) => Promise<void>;
  onPermission?: (request: ProviderPermissionRequest, meta: { threadId: string }) => Promise<PermissionDecision>;
  launchCommand?: GeminiAcpLaunchCommand;
  spawnProcess?: (command: string, args: string[], options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    stdio: ['pipe', 'pipe', 'pipe'];
  }) => ChildProcess;
  historyQuietMs?: number;
  postPromptQuietMs?: number;
};

type GeminiAcpCapabilityDiscoveryOptions = {
  cwd: string;
  preferredSessionId?: string;
  signal?: AbortSignal;
  launchCommand?: GeminiAcpLaunchCommand;
  spawnProcess?: (command: string, args: string[], options: {
    cwd: string;
    env: NodeJS.ProcessEnv;
    signal?: AbortSignal;
    stdio: ['pipe', 'pipe', 'pipe'];
  }) => ChildProcess;
};

type PendingJsonRpcRequest = {
  method: string;
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

type GeminiAcpToolCallState = {
  toolCallId: string;
  title: string;
  kind?: string;
  status?: string;
  locations: Array<{ path: string; line?: number }>;
  content: Array<Record<string, unknown>>;
  rawInput?: unknown;
  rawOutput?: unknown;
};

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_HISTORY_QUIET_MS = 150;
const DEFAULT_HISTORY_TIMEOUT_MS = 3_000;
const DEFAULT_POST_PROMPT_QUIET_MS = 300;
const DEFAULT_POST_PROMPT_TIMEOUT_MS = 5_000;

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line) as unknown;
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null;
  } catch {
    return null;
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function asString(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback;
}

function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function stringifyUnknown(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (value === null || value === undefined) {
    return '';
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function normalizeGeminiAcpMode(approvalPolicy: ApprovalPolicy): string {
  return approvalPolicy === 'yolo' ? 'yolo' : 'default';
}

function normalizeCapabilityOption(
  value: unknown,
  fallbackPrefix: string,
  index: number,
): GeminiCapabilityOption | null {
  if (typeof value === 'string') {
    const id = value.trim();
    if (!id) {
      return null;
    }
    return { id, label: id };
  }
  const record = asRecord(value);
  if (!record) {
    return null;
  }
  const id = asString(record.id ?? record.modeId ?? record.modelId ?? record.name, '').trim();
  if (!id) {
    return null;
  }
  const label = asString(record.label ?? record.displayName ?? record.title, '').trim() || id;
  return { id, label: label || `${fallbackPrefix}-${index + 1}` };
}

function normalizeCapabilityOptions(value: unknown, fallbackPrefix: string): GeminiCapabilityOption[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: GeminiCapabilityOption[] = [];
  for (const [index, entry] of value.entries()) {
    const option = normalizeCapabilityOption(entry, fallbackPrefix, index);
    if (!option || seen.has(option.id)) {
      continue;
    }
    seen.add(option.id);
    normalized.push(option);
  }
  return normalized;
}

function mapStopReason(value: string): SessionProtocolStopReason {
  if (value === 'end_turn') {
    return 'completed';
  }
  if (value === 'cancelled') {
    return 'aborted';
  }
  return 'unknown';
}

function buildTurnEndEnvelopes(input: {
  sessionId: string;
  stopReason: SessionProtocolStopReason;
}): SessionProtocolEnvelope[] {
  return [
    {
      kind: 'text',
      provider: 'gemini',
      source: 'assistant',
      sessionId: input.sessionId,
      text: '',
    },
    {
      kind: 'turn-end',
      provider: 'gemini',
      source: 'result',
      sessionId: input.sessionId,
      threadId: input.sessionId,
      threadIdSource: 'observed',
      stopReason: input.stopReason,
    },
    {
      kind: 'stop',
      provider: 'gemini',
      source: 'result',
      sessionId: input.sessionId,
      reason: input.stopReason,
    },
  ];
}

function updateFinalTextEnvelope(
  envelopes: SessionProtocolEnvelope[],
  text: string,
): SessionProtocolEnvelope[] {
  return envelopes.map((envelope) => (
    envelope.kind === 'text'
      ? { ...envelope, text }
      : envelope
  ));
}

function buildTurnStartEnvelope(sessionId: string): SessionProtocolEnvelope {
  return {
    kind: 'turn-start',
    provider: 'gemini',
    source: 'system',
    sessionId,
    threadId: sessionId,
    threadIdSource: 'observed',
  };
}

function normalizeToolLocations(value: unknown): Array<{ path: string; line?: number }> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => {
      const record = asRecord(entry);
      const path = asString(record?.path, '').trim();
      if (!path) {
        return null;
      }
      const line = asNumber(record?.line);
      return line !== undefined ? { path, line } : { path };
    })
    .filter((entry): entry is { path: string; line?: number } => Boolean(entry));
}

function normalizeToolContent(value: unknown): Array<Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => asRecord(entry))
    .filter((entry): entry is Record<string, unknown> => Boolean(entry));
}

function mergeToolCallState(
  previous: GeminiAcpToolCallState | undefined,
  update: Record<string, unknown>,
): GeminiAcpToolCallState | null {
  const toolCallId = asString(update.toolCallId, previous?.toolCallId ?? '').trim();
  if (!toolCallId) {
    return null;
  }
  return {
    toolCallId,
    title: asString(update.title, previous?.title ?? '').trim() || previous?.title || 'Gemini ACP tool',
    kind: asString(update.kind, previous?.kind ?? '').trim() || previous?.kind,
    status: asString(update.status, previous?.status ?? '').trim() || previous?.status,
    locations: Object.prototype.hasOwnProperty.call(update, 'locations')
      ? normalizeToolLocations(update.locations)
      : previous?.locations ?? [],
    content: Object.prototype.hasOwnProperty.call(update, 'content')
      ? normalizeToolContent(update.content)
      : previous?.content ?? [],
    rawInput: Object.prototype.hasOwnProperty.call(update, 'rawInput')
      ? update.rawInput
      : previous?.rawInput,
    rawOutput: Object.prototype.hasOwnProperty.call(update, 'rawOutput')
      ? update.rawOutput
      : previous?.rawOutput,
  };
}

function formatDiffPreview(entry: Record<string, unknown>): string {
  const path = asString(entry.path, '').trim();
  const oldText = asString(entry.oldText, '');
  const newText = asString(entry.newText, '');
  const kind = asString(asRecord(entry._meta)?.kind, '').trim().toLowerCase();
  const header = kind === 'add'
    ? '*** Add File'
    : kind === 'delete'
      ? '*** Delete File'
      : '*** Update File';
  const oldLines = oldText.replace(/\r\n/g, '\n').split('\n').filter((line) => line.length > 0);
  const newLines = newText.replace(/\r\n/g, '\n').split('\n').filter((line) => line.length > 0);
  return [
    path ? `${header}: ${path}` : header,
    ...oldLines.map((line) => `-${line}`),
    ...newLines.map((line) => `+${line}`),
  ].join('\n').trim();
}

function extractToolOutput(state: GeminiAcpToolCallState): string {
  const contentParts = state.content
    .map((entry) => {
      const type = asString(entry.type, '').trim();
      if (type === 'content') {
        const content = asRecord(entry.content);
        if (asString(content?.type, '').trim() === 'text') {
          return asString(content?.text, '');
        }
        return stringifyUnknown(content);
      }
      if (type === 'diff') {
        return formatDiffPreview(entry);
      }
      if (type === 'terminal') {
        const terminalId = asString(entry.terminalId, '').trim();
        return terminalId ? `terminal: ${terminalId}` : 'terminal';
      }
      return stringifyUnknown(entry);
    })
    .filter((part) => part.trim().length > 0);

  if (contentParts.length > 0) {
    return contentParts.join('\n\n').trim();
  }
  return stringifyUnknown(state.rawOutput).trim();
}

function extractToolCommand(state: GeminiAcpToolCallState): string | undefined {
  const rawInput = asRecord(state.rawInput);
  const direct = [
    rawInput?.command,
    rawInput?.cmd,
    rawInput?.shellCommand,
    rawInput?.bashCommand,
  ]
    .map((entry) => asString(entry, '').trim())
    .find(Boolean);
  return direct || undefined;
}

function inferActionTypeFromToolState(state: GeminiAcpToolCallState, output: string): ProviderActionEvent['actionType'] {
  const command = extractToolCommand(state);
  if (command) {
    return inferActionTypeFromCommand(command);
  }

  const loweredTitle = state.title.trim().toLowerCase();
  const loweredKind = (state.kind ?? '').trim().toLowerCase();
  const hasDiffContent = state.content.some((entry) => asString(entry.type, '').trim() === 'diff');

  if (hasDiffContent || loweredKind === 'edit' || loweredKind === 'write') {
    return 'file_write';
  }
  if (loweredKind === 'read' || loweredTitle.includes('read')) {
    return 'file_read';
  }
  if (
    loweredKind === 'search'
    || loweredKind === 'list'
    || loweredTitle.includes('list')
    || loweredTitle.includes('glob')
    || loweredTitle.includes('search')
  ) {
    return 'file_list';
  }
  if (state.locations.length > 0 && output && !hasDiffContent) {
    return 'file_read';
  }
  return 'command_execution';
}

function buildProviderActionFromToolState(state: GeminiAcpToolCallState): ProviderActionEvent {
  const output = extractToolOutput(state);
  const actionType = inferActionTypeFromToolState(state, output);
  const diffStats = actionType === 'file_write'
    ? summarizeFileChangeDiff(output, asString(asRecord(state.content[0]?._meta)?.kind, ''))
    : summarizeDiffText(output);
  const command = extractToolCommand(state);
  const primaryPath = state.locations[0]?.path?.trim() || undefined;

  return {
    actionType,
    title: state.title.trim() || titleForActionType(actionType),
    callId: state.toolCallId,
    ...(command ? { command } : {}),
    ...(primaryPath ? { path: primaryPath } : {}),
    ...(output ? { output } : {}),
    additions: diffStats.additions,
    deletions: diffStats.deletions,
    hasDiffSignal: diffStats.hasDiffSignal,
  };
}

function buildToolStartEnvelope(input: {
  sessionId: string;
  state: GeminiAcpToolCallState;
  action: ProviderActionEvent;
}): SessionProtocolEnvelope {
  return {
    kind: 'tool-call-start',
    provider: 'gemini',
    source: 'tool',
    sessionId: input.sessionId,
    turnId: input.sessionId,
    toolCallId: input.state.toolCallId,
    toolName: input.state.kind?.trim() || input.action.actionType,
    action: input.action,
  };
}

function buildToolEndEnvelope(input: {
  sessionId: string;
  state: GeminiAcpToolCallState;
  action: ProviderActionEvent;
  stopReason: SessionProtocolStopReason;
}): SessionProtocolEnvelope {
  return {
    kind: 'tool-call-end',
    provider: 'gemini',
    source: 'tool',
    sessionId: input.sessionId,
    turnId: input.sessionId,
    toolCallId: input.state.toolCallId,
    toolName: input.state.kind?.trim() || input.action.actionType,
    action: input.action,
    stopReason: input.stopReason,
  };
}

function buildTextEnvelope(input: {
  sessionId: string;
  text: string;
  itemId?: string;
}): SessionProtocolEnvelope {
  return {
    kind: 'text',
    provider: 'gemini',
    source: 'assistant',
    sessionId: input.sessionId,
    turnId: input.sessionId,
    ...(input.itemId ? { itemId: input.itemId } : {}),
    text: sanitizeAgentMessageText(input.text),
  };
}

function inferPermissionRisk(toolCall: Record<string, unknown> | null): ProviderPermissionRequest['risk'] {
  const kind = asString(toolCall?.kind, '').trim().toLowerCase();
  const title = asString(toolCall?.title, '').trim().toLowerCase();
  if (kind === 'execute' || title.includes('run') || title.includes('command')) {
    return 'high';
  }
  if (kind === 'edit' || kind === 'write' || title.includes('write') || title.includes('edit')) {
    return 'high';
  }
  if (kind === 'read' || kind === 'search' || title.includes('read') || title.includes('search')) {
    return 'low';
  }
  return 'medium';
}

function buildPermissionRequest(params: Record<string, unknown>, requestId: string): ProviderPermissionRequest {
  const toolCall = asRecord(params.toolCall);
  const title = asString(toolCall?.title, 'Gemini ACP tool');
  const toolCallId = asString(toolCall?.toolCallId, requestId).trim() || requestId;
  const kind = asString(toolCall?.kind, 'tool').trim();
  const locationList = Array.isArray(toolCall?.locations)
    ? toolCall.locations
        .map((entry) => asString(asRecord(entry)?.path, '').trim())
        .filter(Boolean)
    : [];
  const locationSuffix = locationList.length > 0 ? ` (${locationList.join(', ')})` : '';
  return {
    callId: toolCallId,
    approvalId: requestId,
    command: `${title}${locationSuffix}`,
    reason: `Gemini ACP requested permission for ${kind || 'tool'} execution.`,
    risk: inferPermissionRisk(toolCall),
  };
}

function selectPermissionOutcome(
  decision: PermissionDecision,
  options: Array<Record<string, unknown>>,
): { outcome: 'cancelled' } | { outcome: 'selected'; optionId: string } {
  if (decision === 'deny') {
    return { outcome: 'cancelled' };
  }

  const kinds = options
    .map((option) => ({
      kind: asString(option.kind, '').trim(),
      optionId: asString(option.optionId, '').trim(),
    }))
    .filter((option) => option.optionId);

  const preferredKinds = decision === 'allow_once'
    ? ['allow_once', 'allow_always']
    : ['allow_always', 'allow_once'];

  for (const kind of preferredKinds) {
    const match = kinds.find((option) => option.kind === kind);
    if (match) {
      return { outcome: 'selected', optionId: match.optionId };
    }
  }

  return { outcome: 'cancelled' };
}

async function waitForQuiet(input: {
  getActivityTick: () => number;
  getLastActivityAt: () => number;
  quietMs: number;
  timeoutMs: number;
}): Promise<void> {
  const startedAt = Date.now();
  let observedTick = input.getActivityTick();

  while (Date.now() - startedAt < input.timeoutMs) {
    await delay(Math.min(50, input.quietMs));
    const currentTick = input.getActivityTick();
    const idleFor = Date.now() - input.getLastActivityAt();
    if (currentTick === observedTick && idleFor >= input.quietMs) {
      return;
    }
    observedTick = currentTick;
  }
}

async function waitForPostPromptSettle(input: {
  getActivityTick: () => number;
  getLastActivityAt: () => number;
  quietMs: number;
  timeoutMs: number;
  getEmitChain: () => Promise<void>;
}): Promise<void> {
  const startedAt = Date.now();

  for (;;) {
    const beforeTick = input.getActivityTick();
    const beforeChain = input.getEmitChain();
    const remainingTimeoutMs = Math.max(input.quietMs, input.timeoutMs - (Date.now() - startedAt));

    await waitForQuiet({
      getActivityTick: input.getActivityTick,
      getLastActivityAt: input.getLastActivityAt,
      quietMs: input.quietMs,
      timeoutMs: remainingTimeoutMs,
    });
    await beforeChain;

    const afterTick = input.getActivityTick();
    const afterChain = input.getEmitChain();
    if (afterTick === beforeTick && afterChain === beforeChain) {
      return;
    }

    if (Date.now() - startedAt >= input.timeoutMs) {
      return;
    }
  }
}

export async function inspectGeminiAcpSessionCapabilities(
  input: GeminiAcpCapabilityDiscoveryOptions,
): Promise<GeminiSessionCapabilities> {
  const launchCommand = input.launchCommand ?? {
    command: 'gemini',
    args: ['--acp'],
  };
  const spawnProcess = input.spawnProcess ?? spawn;
  const child = spawnProcess(launchCommand.command, launchCommand.args, {
    cwd: input.cwd,
    env: {
      ...process.env,
      ...(launchCommand.env ?? {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    signal: input.signal,
  });

  if (!child.stdin || !child.stdout || !child.stderr) {
    throw new Error('gemini ACP stdio streams are unavailable');
  }

  const stdoutLines = createInterface({ input: child.stdout });
  const pendingRequests = new Map<string, PendingJsonRpcRequest>();
  let requestSequence = 0;
  let stderr = '';

  const childClosed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  const sendRequest = <TResult extends Record<string, unknown> = Record<string, unknown>>(
    method: string,
    params?: Record<string, unknown>,
  ): Promise<TResult> => {
    if (!child.stdin || child.stdin.destroyed) {
      return Promise.reject(new Error('gemini ACP stdin is closed'));
    }
    const id = `cap-${++requestSequence}`;
    const payload = {
      jsonrpc: '2.0',
      id,
      method,
      ...(params ? { params } : {}),
    };
    return new Promise<TResult>((resolve, reject) => {
      pendingRequests.set(id, {
        method,
        resolve: (value) => resolve(value as TResult),
        reject,
      });
      child.stdin!.write(`${JSON.stringify(payload)}\n`, (error) => {
        if (error) {
          pendingRequests.delete(id);
          reject(error);
        }
      });
    });
  };

  stdoutLines.on('line', (line) => {
    const message = parseJsonLine(line);
    if (!message) {
      return;
    }
    const id = message.id;
    if (typeof id !== 'string' && typeof id !== 'number') {
      return;
    }
    const key = String(id);
    const pending = pendingRequests.get(key);
    if (!pending) {
      return;
    }
    pendingRequests.delete(key);
    const errorRecord = asRecord(message.error);
    if (errorRecord) {
      const detail = asString(errorRecord.message, '').trim() || stringifyUnknown(errorRecord);
      pending.reject(new Error(detail || `gemini ACP ${pending.method} failed`));
      return;
    }
    pending.resolve(asRecord(message.result) ?? {});
  });

  child.stderr.on('data', (chunk) => {
    stderr += chunk.toString();
  });

  try {
    await sendRequest('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {},
    });

    const response = input.preferredSessionId
      ? await sendRequest<Record<string, unknown>>('session/load', {
          sessionId: input.preferredSessionId,
          cwd: input.cwd,
          mcpServers: [],
        })
      : await sendRequest<Record<string, unknown>>('session/new', {
          cwd: input.cwd,
          mcpServers: [],
        });

    const responseSessionId = asString(response.sessionId, '').trim() || input.preferredSessionId || '';
    if (!responseSessionId) {
      throw new Error('gemini ACP did not return a session id');
    }

    const modesRecord = asRecord(response.modes);
    const modelsRecord = asRecord(response.models);

    return {
      sessionId: responseSessionId,
      fetchedAt: new Date().toISOString(),
      modes: {
        currentModeId: asString(modesRecord?.currentModeId, '').trim() || null,
        availableModes: normalizeCapabilityOptions(modesRecord?.availableModes, 'mode'),
      },
      models: {
        currentModelId: asString(modelsRecord?.currentModelId, '').trim() || null,
        availableModels: normalizeCapabilityOptions(modelsRecord?.availableModels, 'model'),
      },
    };
  } finally {
    stdoutLines.close();
    for (const pending of pendingRequests.values()) {
      pending.reject(new Error('gemini ACP capability discovery interrupted'));
    }
    pendingRequests.clear();
    if (child.stdin && !child.stdin.destroyed) {
      child.stdin.end();
    }
    if (!child.killed) {
      child.kill('SIGTERM');
    }
    const closed = await Promise.race([
      childClosed,
      delay(1_000).then(() => null),
    ]);
    if (!closed && stderr.trim()) {
      throw new Error(stderr.trim());
    }
  }
}

export async function runGeminiAcpTurn(input: GeminiAcpClientOptions): Promise<GeminiTurnResult> {
  const launchCommand = input.launchCommand ?? {
    command: 'gemini',
    args: ['--acp'],
  };
  const modeId = typeof input.mode === 'string' && input.mode.trim().length > 0
    ? input.mode.trim()
    : normalizeGeminiAcpMode(input.approvalPolicy);
  const spawnProcess = input.spawnProcess ?? spawn;
  const child = spawnProcess(launchCommand.command, launchCommand.args, {
    cwd: input.cwd,
    env: {
      ...process.env,
      ...(launchCommand.env ?? {}),
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    signal: input.signal,
  });

  if (!child.stdin || !child.stdout || !child.stderr) {
    throw new Error('gemini ACP stdio streams are unavailable');
  }

  const stdoutLines = createInterface({ input: child.stdout });
  const pendingRequests = new Map<string, PendingJsonRpcRequest>();
  let requestSequence = 0;
  let stderr = '';
  let stdoutActivityTick = 0;
  let lastStdoutActivityAt = Date.now();
  let sessionId = '';
  let currentText = '';
  let thoughtText = '';
  let thoughtItemId: string | undefined;
  let thoughtSequence = 0;
  let ignoringHistoryReplay = false;
  let emitChain: Promise<void> = Promise.resolve();
  let streamedActionCount = 0;
  const inferredActions: ProviderActionEvent[] = [];
  const protocolEnvelopes: SessionProtocolEnvelope[] = [];
  const toolCalls = new Map<string, GeminiAcpToolCallState>();
  const emittedToolStarts = new Set<string>();

  const childClosed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, closeSignal) => resolve({ code, signal: closeSignal }));
  });
  child.once('close', () => {
    setTimeout(() => {
      if (pendingRequests.size === 0) {
        return;
      }
      for (const pending of pendingRequests.values()) {
        pending.reject(new Error(`gemini ACP process closed before responding${stderr.trim() ? `: ${stderr.trim()}` : ''}`));
      }
      pendingRequests.clear();
    }, 0);
  });

  const sendJsonRpc = (payload: Record<string, unknown>): Promise<void> => new Promise((resolve, reject) => {
    if (child.stdin?.destroyed || !child.stdin?.writable) {
      reject(new Error('gemini ACP stdin is not writable'));
      return;
    }
    child.stdin.write(`${JSON.stringify(payload)}\n`, (error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });

  const sendRequest = <T extends Record<string, unknown> = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> => new Promise((resolve, reject) => {
    const requestId = `aris-gemini-acp-${requestSequence += 1}`;
    pendingRequests.set(requestId, {
      method,
      resolve: (value) => resolve(value as T),
      reject,
    });
    void sendJsonRpc({
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    }).catch((error) => {
      pendingRequests.delete(requestId);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });

  const sendResult = (id: JsonRpcId, result: Record<string, unknown>) => sendJsonRpc({
    jsonrpc: '2.0',
    id,
    result,
  });

  const sendError = (id: JsonRpcId, code: number, message: string) => sendJsonRpc({
    jsonrpc: '2.0',
    id,
    error: {
      code,
      message,
    },
  });

  const handleRequest = async (payload: Record<string, unknown>) => {
    const method = asString(payload.method, '').trim();
    const id = payload.id as JsonRpcId;
    const params = asRecord(payload.params) ?? {};
    if (method === 'session/request_permission') {
      await flushThoughtBuffer();
      const permissionRequest = buildPermissionRequest(params, asString(id, 'permission-request'));
      const decision = input.onPermission
        ? await input.onPermission(permissionRequest, { threadId: sessionId || input.preferredSessionId || '' })
        : 'deny';
      const options = Array.isArray(params.options)
        ? params.options.map((entry) => asRecord(entry) ?? {})
        : [];
      await sendResult(id, {
        outcome: selectPermissionOutcome(decision, options),
      });
      return;
    }
    await sendError(id, -32601, `Unsupported Gemini ACP client method: ${method}`);
  };

  const flushThoughtBuffer = async () => {
    if (!sessionId || !thoughtText.trim()) {
      thoughtText = '';
      thoughtItemId = undefined;
      return;
    }
    const finalizedThought = sanitizeAgentMessageText(thoughtText);
    if (!finalizedThought) {
      thoughtText = '';
      thoughtItemId = undefined;
      return;
    }
    const envelope = buildTextEnvelope({
      sessionId,
      text: finalizedThought,
      ...(thoughtItemId ? { itemId: thoughtItemId } : {}),
    });
    protocolEnvelopes.push(envelope);
    if (input.onText) {
      await input.onText({
        text: finalizedThought,
        source: 'assistant',
        phase: 'commentary',
        threadId: sessionId,
        turnId: sessionId,
        ...(thoughtItemId ? { itemId: thoughtItemId } : {}),
        envelopes: [envelope],
      }, { threadId: sessionId });
    }
    thoughtText = '';
    thoughtItemId = undefined;
  };

  const handleUpdate = (payload: Record<string, unknown>) => {
    const params = asRecord(payload.params) ?? {};
    const update = asRecord(params.update) ?? {};
    const updateType = asString(update.sessionUpdate, '').trim();
    if (!sessionId) {
      sessionId = asString(params.sessionId, '').trim() || sessionId;
    }
    if (ignoringHistoryReplay) {
      return;
    }
    if (!sessionId) {
      return;
    }

    if (updateType !== 'agent_thought_chunk' && thoughtText.trim()) {
      emitChain = emitChain.then(() => flushThoughtBuffer());
    }

    if (updateType === 'agent_thought_chunk') {
      const content = asRecord(update.content);
      if (asString(content?.type, '').trim() !== 'text') {
        return;
      }
      const chunk = asString(content?.text, '');
      if (!chunk) {
        return;
      }
      if (!thoughtItemId) {
        thoughtSequence += 1;
        thoughtItemId = `gemini-thought-${thoughtSequence}`;
      }
      thoughtText += chunk;
      if (input.onText) {
        emitChain = emitChain.then(() => input.onText?.({
          text: chunk,
          source: 'assistant',
          phase: 'commentary',
          threadId: sessionId,
          turnId: sessionId,
          itemId: thoughtItemId,
          partial: true,
        }, { threadId: sessionId }));
      }
      return;
    }

    if (updateType === 'tool_call' || updateType === 'tool_call_update') {
      const nextState = mergeToolCallState(toolCalls.get(asString(update.toolCallId, '').trim()), update);
      if (!nextState) {
        return;
      }
      toolCalls.set(nextState.toolCallId, nextState);
      const action = buildProviderActionFromToolState(nextState);
      if (!emittedToolStarts.has(nextState.toolCallId)) {
        emittedToolStarts.add(nextState.toolCallId);
        protocolEnvelopes.push(buildToolStartEnvelope({
          sessionId,
          state: nextState,
          action,
        }));
      }
      const normalizedStatus = (nextState.status ?? '').trim().toLowerCase();
      if (normalizedStatus === 'completed' || normalizedStatus === 'failed') {
        const stopReason: SessionProtocolStopReason = normalizedStatus === 'failed' ? 'error' : 'completed';
        protocolEnvelopes.push(buildToolEndEnvelope({
          sessionId,
          state: nextState,
          action,
          stopReason,
        }));
        if (input.onAction) {
          emitChain = emitChain.then(() => input.onAction?.(action, { threadId: sessionId }));
          streamedActionCount += 1;
        } else {
          inferredActions.push(action);
        }
      }
      return;
    }

    if (updateType !== 'agent_message_chunk') {
      return;
    }
    const content = asRecord(update.content);
    if (asString(content?.type, '').trim() !== 'text') {
      return;
    }
    const chunk = asString(content?.text, '');
    if (!chunk) {
      return;
    }
    currentText += chunk;
    if (input.onText && sessionId) {
      emitChain = emitChain.then(() => input.onText?.({
        text: chunk,
        source: 'assistant',
        phase: 'final',
        threadId: sessionId,
        partial: true,
      }, { threadId: sessionId }));
    }
  };

  stdoutLines.on('line', (rawLine) => {
    const line = rawLine.trim();
    if (!line) {
      return;
    }
    stdoutActivityTick += 1;
    lastStdoutActivityAt = Date.now();
    const payload = parseJsonLine(line);
    if (!payload) {
      return;
    }
    const method = asString(payload.method, '').trim();
    const hasId = Object.prototype.hasOwnProperty.call(payload, 'id');

    if (method === 'session/update') {
      handleUpdate(payload);
      return;
    }

    if (method && hasId) {
      emitChain = emitChain
        .then(() => handleRequest(payload))
        .catch(() => undefined);
      return;
    }

    if (!hasId) {
      return;
    }

    const requestId = asString(payload.id, '');
    const pending = pendingRequests.get(requestId);
    if (!pending) {
      return;
    }
    pendingRequests.delete(requestId);
    const errorPayload = asRecord(payload.error);
    if (errorPayload) {
      pending.reject(new Error(asString(errorPayload.message, `ACP request failed: ${pending.method}`)));
      return;
    }
    pending.resolve(asRecord(payload.result) ?? {});
  });

  child.stderr.on('data', (chunk: Buffer | string) => {
    stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  });

  const cancelPrompt = () => {
    if (!sessionId) {
      return;
    }
    void sendJsonRpc({
      jsonrpc: '2.0',
      method: 'session/cancel',
      params: {
        sessionId,
      },
    }).catch(() => undefined);
  };

  const abortHandler = () => {
    cancelPrompt();
  };
  input.signal?.addEventListener('abort', abortHandler);

  try {
    await sendRequest('initialize', {
      protocolVersion: ACP_PROTOCOL_VERSION,
      clientCapabilities: {},
      clientInfo: {
        name: 'aris-runtime',
        version: '0.1.0',
      },
    });

    if (input.preferredSessionId) {
      ignoringHistoryReplay = true;
      await sendRequest('session/load', {
        sessionId: input.preferredSessionId,
        cwd: input.cwd,
        mcpServers: [],
      });
      sessionId = input.preferredSessionId;
      await waitForQuiet({
        getActivityTick: () => stdoutActivityTick,
        getLastActivityAt: () => lastStdoutActivityAt,
        quietMs: input.historyQuietMs ?? DEFAULT_HISTORY_QUIET_MS,
        timeoutMs: DEFAULT_HISTORY_TIMEOUT_MS,
      });
      ignoringHistoryReplay = false;
    } else {
      const created = await sendRequest<{ sessionId?: string }>('session/new', {
        cwd: input.cwd,
        mcpServers: [],
      });
      sessionId = asString(created.sessionId, '').trim();
    }

    if (!sessionId) {
      throw new Error('gemini ACP did not return a session id');
    }
    protocolEnvelopes.push(buildTurnStartEnvelope(sessionId));

    await sendRequest('session/set_mode', {
      sessionId,
      modeId,
    }).catch(() => ({}));

    if (input.model) {
      await sendRequest('session/set_model', {
        sessionId,
        modelId: input.model,
      }).catch(() => ({}));
    }

    const promptResult = await sendRequest<{ stopReason?: string }>('session/prompt', {
      sessionId,
      prompt: [
        {
          type: 'text',
          text: input.prompt,
        },
      ],
    });

    await waitForPostPromptSettle({
      getActivityTick: () => stdoutActivityTick,
      getLastActivityAt: () => lastStdoutActivityAt,
      quietMs: input.postPromptQuietMs ?? DEFAULT_POST_PROMPT_QUIET_MS,
      timeoutMs: DEFAULT_POST_PROMPT_TIMEOUT_MS,
      getEmitChain: () => emitChain,
    });
    emitChain = emitChain.then(() => flushThoughtBuffer());
    await emitChain;

    const output = sanitizeAgentMessageText(currentText);
    const stopReason = mapStopReason(asString(promptResult.stopReason, 'unknown').trim());
    const finalEnvelopes = [
      ...protocolEnvelopes,
      ...updateFinalTextEnvelope(buildTurnEndEnvelopes({
        sessionId,
        stopReason,
      }), output),
    ];

    if (output && input.onText) {
      await input.onText({
        text: output,
        source: 'assistant',
        phase: 'final',
        threadId: sessionId,
        envelopes: finalEnvelopes,
      }, { threadId: sessionId });
    }

    if (!output && stopReason !== 'aborted') {
      throw new Error('gemini ACP returned an empty response');
    }

    return {
      output,
      cwd: input.cwd,
      inferredActions,
      streamedActionsPersisted: streamedActionCount > 0,
      threadId: sessionId,
      threadIdSource: input.preferredSessionId ? 'resume' : 'observed',
      protocolEnvelopes: finalEnvelopes,
    };
  } finally {
    input.signal?.removeEventListener('abort', abortHandler);
    stdoutLines.close();
    if (child.stdin && !child.stdin.destroyed) {
      child.stdin.end();
    }
    if (!child.killed) {
      child.kill('SIGTERM');
    }
    await Promise.race([
      childClosed,
      delay(1_000).then(() => null),
    ]);
  }
}
