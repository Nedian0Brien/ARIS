import { setTimeout as delay } from 'node:timers/promises';
import { createInterface } from 'node:readline';
import { spawn, type ChildProcess } from 'node:child_process';
import type { ApprovalPolicy, PermissionDecision } from '../../../types.js';
import { sanitizeAgentMessageText } from '../../agentMessageSanitizer.js';
import type { ProviderPermissionRequest, ProviderTextEvent } from '../../contracts/providerRuntime.js';
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
  preferredSessionId?: string;
  signal?: AbortSignal;
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

type PendingJsonRpcRequest = {
  method: string;
  resolve: (value: Record<string, unknown>) => void;
  reject: (error: Error) => void;
};

const ACP_PROTOCOL_VERSION = 1;
const DEFAULT_HISTORY_QUIET_MS = 150;
const DEFAULT_HISTORY_TIMEOUT_MS = 3_000;
const DEFAULT_POST_PROMPT_QUIET_MS = 80;
const DEFAULT_POST_PROMPT_TIMEOUT_MS = 1_500;

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

function normalizeGeminiAcpMode(approvalPolicy: ApprovalPolicy): string {
  return approvalPolicy === 'yolo' ? 'yolo' : 'default';
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
    command: `${title}${locationSuffix}`,
    reason: `Gemini ACP requested permission for ${kind || 'tool'} execution.`,
    risk: 'medium',
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

export async function runGeminiAcpTurn(input: GeminiAcpClientOptions): Promise<GeminiTurnResult> {
  const launchCommand = input.launchCommand ?? {
    command: 'gemini',
    args: ['--acp'],
  };
  const modeId = normalizeGeminiAcpMode(input.approvalPolicy);
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
  let ignoringHistoryReplay = false;
  let emitChain: Promise<void> = Promise.resolve();

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

    await waitForQuiet({
      getActivityTick: () => stdoutActivityTick,
      getLastActivityAt: () => lastStdoutActivityAt,
      quietMs: input.postPromptQuietMs ?? DEFAULT_POST_PROMPT_QUIET_MS,
      timeoutMs: DEFAULT_POST_PROMPT_TIMEOUT_MS,
    });
    await emitChain;

    const output = sanitizeAgentMessageText(currentText);
    const stopReason = mapStopReason(asString(promptResult.stopReason, 'unknown').trim());
    const envelopes = updateFinalTextEnvelope(buildTurnEndEnvelopes({
      sessionId,
      stopReason,
    }), output);

    if (output && input.onText) {
      await input.onText({
        text: output,
        source: 'assistant',
        threadId: sessionId,
        envelopes,
      }, { threadId: sessionId });
    }

    if (!output && stopReason !== 'aborted') {
      throw new Error('gemini ACP returned an empty response');
    }

    return {
      output,
      cwd: input.cwd,
      inferredActions: [],
      streamedActionsPersisted: false,
      threadId: sessionId,
      threadIdSource: input.preferredSessionId ? 'resume' : 'observed',
      protocolEnvelopes: envelopes,
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
