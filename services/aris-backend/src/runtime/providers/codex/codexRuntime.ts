/**
 * Codex turn runtime — extracted from runtimeCore.ts.
 *
 * Three exported entry points implement the codex turn body:
 *   - runCodexCli         — dispatcher between exec and app-server modes
 *                            (handles missing-thread retry + fallback)
 *   - runCodexAppServer   — WebSocket JSON-RPC turn body
 *   - runCodexExecCli     — `codex exec --json` stdout-streaming turn body
 *
 * Plus `resolveCodexThreadId` which recovers the most recent codex thread
 * id from persisted message history when the thread cache is empty.
 *
 * All four functions take a `CodexRuntimeHost` deps object so they remain
 * decoupled from the larger `RuntimeCore` class. The host exposes only the
 * narrow surface codex needs: shared state (codexThreads cache),
 * orchestration modules (permissionRouter, activeRunRegistry,
 * coordinationStore, runtimeEventLogger), and bound persistence helpers
 * (appendAgentMessage, listMessages, createPermission, decidePermission,
 * resolveExecutionCwd, resolveSessionApprovalPolicy).
 *
 * Phase 2 Sprint 6 — final structural extraction. After this PR the only
 * codex symbol surviving in runtimeCore.ts is the import for these
 * functions plus the `codexThreads` Map (still owned by RuntimeCore so
 * `clearCodexThreadsForSession` cross-cutting cleanup can reach it).
 */

import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { inferActionTypeFromCommand, titleForActionType } from '../../actionType.js';
import { sanitizeAgentMessageText, shouldDisplayToolStatus } from '../../agentMessageSanitizer.js';
import { summarizeDiffText } from '../../diffStats.js';
import { resolveRuntimeModelSelection } from '../../modelPolicy.js';
import { RuntimeEventLogger } from '../../runtimeEventLogger.js';
import { PermissionRouter, buildScopedPermissionKey } from '../../orchestration/permissionRouter.js';
import { ActiveRunRegistry } from '../../orchestration/activeRunRegistry.js';
import type { RuntimeCoordinationStore, HappyRuntimePermissionInput } from '../../contracts/runtimeCoordinationStore.js';
import type {
  ApprovalPolicy,
  PermissionDecision,
  PermissionRequest,
  PermissionRisk,
  RuntimeMessage,
  RuntimeSession,
} from '../../../types.js';
import {
  buildCodexAppServerListenUrl,
  connectCodexAppServerSocket,
  normalizeCodexAppServerMessageData,
  reserveCodexAppServerPort,
} from './codexAppServerClient.js';
import {
  createCodexAppServerAbortPromise,
  launchDetachedCodexAppServerProcess,
  rejectCodexAppServerPendingRequests,
  terminateCodexAppServerProcess,
} from './codexAppServerLifecycle.js';
import {
  extractCodexAppServerApproval,
  normalizeCodexApprovalPolicy,
} from './codexPermissionBridge.js';
import {
  buildCodexPermissionKey,
  buildCodexThreadCacheKey,
  classifyCodexAppServerFailure,
  extractCodexPermissionRequest,
  inferCodexFileWriteItem,
  isMissingCodexThreadError,
  type CodexAppServerFailureKind,
} from './codexProtocolMapper.js';
import { buildCodexCommand } from './codexLauncher.js';
import type { CodexPermissionRequest } from './types.js';

// ---------------------------------------------------------------------------
// Module-level constants (env-driven)
// ---------------------------------------------------------------------------

export const CODEX_SANDBOX_MODE = (process.env.CODEX_SANDBOX_MODE || 'workspace-write').trim();
export const CODEX_RUNTIME_MODE = (process.env.CODEX_RUNTIME_MODE || 'app-server').trim().toLowerCase();

const CODEX_TURN_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.CODEX_TURN_TIMEOUT_MS || '', 10);
  if (Number.isFinite(parsed) && parsed >= 60_000) {
    return parsed;
  }
  return 30 * 60 * 1000; // 30 minutes
})();

const CODEX_APP_SERVER_POST_TURN_QUIET_MS = (() => {
  const parsed = Number.parseInt(process.env.CODEX_APP_SERVER_POST_TURN_QUIET_MS || '', 10);
  if (Number.isFinite(parsed) && parsed >= 100) {
    return parsed;
  }
  return 1_500;
})();

const CODEX_APP_SERVER_POST_TURN_DRAIN_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.CODEX_APP_SERVER_POST_TURN_DRAIN_TIMEOUT_MS || '', 10);
  if (Number.isFinite(parsed) && parsed >= 1_000) {
    return parsed;
  }
  return 15_000;
})();

const AGENT_EXTRA_PATHS = '/home/ubuntu/.local/bin:/home/ubuntu/.nvm/versions/node/v20.18.1/bin:/home/ubuntu/.bun/bin';

// ---------------------------------------------------------------------------
// Local pure utilities (mirror those in runtimeCore.ts)
// ---------------------------------------------------------------------------

type ModelReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
type JsonRpcId = string | number | null;

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null
    && value !== undefined
    && typeof value === 'object'
    && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    return asRecord(JSON.parse(line));
  } catch {
    return null;
  }
}

function unwrapShellCommand(command: string): string {
  let current = command.trim();
  if (current.startsWith('$ ')) {
    current = current.slice(2).trim();
  }
  const wrappers = [/^(?:\/bin\/)?bash\s+-lc\s+([\s\S]+)$/i, /^(?:\/bin\/)?sh\s+-lc\s+([\s\S]+)$/i];
  for (const wrapper of wrappers) {
    const match = current.match(wrapper);
    if (!match) continue;
    const inner = match[1]?.trim() ?? '';
    current = (inner.startsWith('"') && inner.endsWith('"'))
      || (inner.startsWith("'") && inner.endsWith("'"))
      ? inner.slice(1, -1).trim()
      : inner;
  }
  return current;
}

function stripAnsi(value: string): string {
  return value
    .replace(/\x1B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g, '')
    .replace(/\]?\d+(?:;\d+){2,};?/g, '')
    .replace(/^\s*\d+;\s*$/gm, '')
    .replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '')
    .replace(/\n?\d+;\s*$/g, '')
    .trim();
}

function trimOutput(value: string): string {
  const AGENT_MAX_OUTPUT_CHARS = 64_000;
  const normalized = value.trim();
  return normalized.length <= AGENT_MAX_OUTPUT_CHARS
    ? normalized
    : normalized.slice(0, AGENT_MAX_OUTPUT_CHARS);
}

function shouldSkipDuplicateAgentMessage(seen: Set<string>, turnId: string | undefined, text: string): boolean {
  const normalized = text.trim();
  if (!normalized) return false;
  const tid = typeof turnId === 'string' ? turnId.trim() : '';
  const key = tid ? `${tid}:${normalized}` : normalized;
  if (seen.has(key)) return true;
  seen.add(key);
  return false;
}

function toJsonRpcIdKey(id: unknown): string {
  if (typeof id === 'string' || typeof id === 'number') return String(id);
  if (id === null) return 'null';
  return JSON.stringify(id);
}

function normalizeModel(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const canonical = trimmed === 'gpt-5-codex' ? 'gpt-5.3-codex' : trimmed;
  return canonical;
}

function normalizeModelReasoningEffort(value: unknown): ModelReasoningEffort | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if (v === 'low' || v === 'medium' || v === 'high' || v === 'xhigh') return v;
  return undefined;
}

async function waitForStableActivity(input: {
  getActivityTick: () => number;
  getLastActivityAt: () => number;
  quietMs: number;
  timeoutMs: number;
}): Promise<void> {
  const deadline = Date.now() + Math.max(0, input.timeoutMs);
  let observed = input.getActivityTick();
  while (Date.now() < deadline) {
    const idle = Date.now() - input.getLastActivityAt();
    if (idle >= input.quietMs) {
      const tick = input.getActivityTick();
      if (tick === observed) return;
      observed = tick;
      continue;
    }
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    const wait = Math.min(Math.max(10, input.quietMs - Math.max(0, idle)), remaining);
    await new Promise<void>((resolve) => { setTimeout(resolve, wait); });
    observed = input.getActivityTick();
  }
}

// ---------------------------------------------------------------------------
// Host interface — narrow surface RuntimeCore exposes to codex turn code
// ---------------------------------------------------------------------------

export interface CodexRuntimeHost {
  runtimeEventLogger: RuntimeEventLogger;
  permissionRouter: PermissionRouter;
  activeRunRegistry: ActiveRunRegistry;
  coordinationStore: RuntimeCoordinationStore | null;
  codexThreads: Map<string, string>;
  appendAgentMessage(
    sessionId: string,
    text: string,
    meta?: Record<string, unknown>,
    options?: { type?: string; title?: string },
  ): Promise<void>;
  listMessages(
    sessionId: string,
    options?: { afterSeq?: number; afterId?: string; limit?: number },
  ): Promise<RuntimeMessage[]>;
  createPermission(input: HappyRuntimePermissionInput): Promise<PermissionRequest>;
  decidePermission(permissionId: string, decision: PermissionDecision): Promise<PermissionRequest>;
  resolveExecutionCwd(cwdHint?: string): string;
  resolveSessionApprovalPolicy(session: RuntimeSession): ApprovalPolicy;
}

// ---------------------------------------------------------------------------
// Extracted run methods
// ---------------------------------------------------------------------------

export async function runCodexCli(
  host: CodexRuntimeHost,
  session: RuntimeSession,
  prompt: string,
  signal?: AbortSignal,
  threadId?: string,
  chatId?: string,
  model?: string,
  modelReasoningEffort?: ModelReasoningEffort,
): Promise<{ output: string; cwd: string; streamedPersisted: boolean; agentMessagePersisted: boolean; threadId?: string }> {
  if (CODEX_RUNTIME_MODE === 'exec') {
    return runCodexExecCli(host, session, prompt, signal, threadId, chatId, model, modelReasoningEffort);
  }

  try {
    return await runCodexAppServer(host, session, prompt, signal, threadId, chatId, model, modelReasoningEffort);
  } catch (error) {
    const failure = classifyCodexAppServerFailure(error);
    if (failure.kind === 'missing_thread') {
      throw error;
    }
    if (CODEX_RUNTIME_MODE === 'app-server-strict') {
      throw error;
    }

    const threadCacheKey = buildCodexThreadCacheKey(session.id, chatId);
    const hadThreadId = typeof threadId === 'string' && threadId.trim().length > 0;
    if (failure.clearCachedThread) {
      host.codexThreads.delete(threadCacheKey);
    }
    if (failure.retryWithFreshThread && hadThreadId) {
      host.runtimeEventLogger.logParsed({
        sessionId: session.id,
        agent: 'codex',
        ...(chatId ? { chatId } : {}),
        model,
        turnStatus: 'retrying',
        channel: 'app_server',
        stage: 'run_status',
        payload: {
          mode: 'app-server',
          retryMode: 'fresh_thread',
          failureKind: failure.kind,
          errorMessage: failure.detail,
        },
      });
      return runCodexAppServer(host, session, prompt, signal, undefined, chatId, model, modelReasoningEffort);
    }

    host.runtimeEventLogger.logParsed({
      sessionId: session.id,
      agent: 'codex',
      ...(chatId ? { chatId } : {}),
      model,
      turnStatus: 'fallback_to_exec',
      channel: 'app_server',
      stage: 'run_status',
      payload: {
        mode: 'app-server',
        fallbackMode: 'exec',
        failureKind: failure.kind,
        errorMessage: failure.detail,
        hadThreadId,
      },
    });
    console.error(`codex app-server mode failed; falling back to exec mode [${failure.kind}]: ${failure.detail}`);
    return runCodexExecCli(host, session, prompt, signal, threadId, chatId, model, modelReasoningEffort);
  }
}

export async function runCodexAppServer(
  host: CodexRuntimeHost,
  session: RuntimeSession,
  prompt: string,
  signal?: AbortSignal,
  threadId?: string,
  chatId?: string,
  model?: string,
  modelReasoningEffort?: ModelReasoningEffort,
): Promise<{ output: string; cwd: string; streamedPersisted: boolean; agentMessagePersisted: boolean; threadId?: string }> {
  const safeCwd = host.resolveExecutionCwd(session.metadata.path);
  const threadCacheKey = buildCodexThreadCacheKey(session.id, chatId);
  const sessionApprovalPolicy = host.resolveSessionApprovalPolicy(session);
  const codexApprovalPolicy = normalizeCodexApprovalPolicy(sessionApprovalPolicy);
  const selectedModel = normalizeModel(model) ?? resolveRuntimeModelSelection({
    agent: 'codex',
    sessionModel: session.metadata.model,
  }).model;
  const selectedReasoningEffort = normalizeModelReasoningEffort(modelReasoningEffort);
  const autoApproveAll = sessionApprovalPolicy === 'yolo';
  const effectiveSandboxMode = autoApproveAll ? 'danger-full-access' : CODEX_SANDBOX_MODE;
  const mergedPath = `${process.env.PATH || ''}:${AGENT_EXTRA_PATHS}`;
  const listenPort = await reserveCodexAppServerPort();
  const listenUrl = buildCodexAppServerListenUrl(listenPort);
  const args = [
    ...(selectedModel ? ['-c', `model=${JSON.stringify(selectedModel)}`] : []),
    ...(selectedReasoningEffort ? ['-c', `model_reasoning_effort=${JSON.stringify(selectedReasoningEffort)}`] : []),
    'app-server',
    '--listen',
    listenUrl,
  ];
  const appServerPid = await launchDetachedCodexAppServerProcess({
    cwd: safeCwd,
    env: { ...process.env, PATH: mergedPath },
    args,
    signal,
  });
  host.runtimeEventLogger.logParsed({
    sessionId: session.id,
    agent: 'codex',
    ...(chatId ? { chatId } : {}),
    model: selectedModel,
    turnStatus: 'run_started',
    channel: 'app_server',
    stage: 'run_status',
    payload: {
      mode: 'app-server',
      args,
      listenUrl,
      appServerPid,
    },
  });

  const socket = await connectCodexAppServerSocket(listenUrl, { signal });
  let appendChain: Promise<void> = Promise.resolve();
  let permissionChain: Promise<void> = Promise.resolve();
  let lastAgentMessage = '';
  let pendingAgentMessage = '';
  let streamedPersisted = false;
  let agentMessagePersisted = false;
  let transportActivityTick = 0;
  let lastTransportActivityAt = Date.now();
  let resolvedThreadId = typeof threadId === 'string' && threadId.trim().length > 0
    ? threadId.trim()
    : '';
  let activeTurnId = '';
  let turnCompleted = false;
  let runStatus: 'running' | 'completed' | 'failed' | 'aborted' | 'timed_out' = 'running';
  let runErrorMessage: string | undefined;
  let runFailureKind: CodexAppServerFailureKind | undefined;
  const runtimePermissionIds = new Set<string>();
  const persistedAgentMessageKeys = new Set<string>();

  const pendingRequests = new Map<string, {
    method: string;
    resolve: (result: Record<string, unknown>) => void;
    reject: (error: Error) => void;
  }>();
  let requestSequence = 0;

  let resolveTurnCompletion: ((value: { status: string; errorMessage?: string }) => void) | null = null;
  const turnCompletion = new Promise<{ status: string; errorMessage?: string }>((resolve) => {
    resolveTurnCompletion = resolve;
  });

  const transportClosed = new Promise<never>((_, reject) => {
    const handleClose = () => {
      socket.removeEventListener('close', handleClose);
      reject(new Error('codex app-server websocket closed before turn completion'));
    };
    socket.addEventListener('close', handleClose);
  });

  const abortController = createCodexAppServerAbortPromise({
    signal,
    pendingRequests,
    onAbort: () => {
      if (turnCompleted) {
        return;
      }
      resolveTurnCompletion?.({ status: 'interrupted' });
      try {
        socket.close(1000, 'turn-abort');
      } catch {
        // ignore websocket close failures while aborting
      }
    },
  });

  const enqueueAppend = (
    text: string,
    meta: Record<string, unknown>,
    options: { type?: string; title?: string } = {},
  ) => {
    host.runtimeEventLogger.logParsed({
      sessionId: session.id,
      agent: 'codex',
      ...(chatId ? { chatId } : {}),
      model: selectedModel,
      channel: 'app_server',
      stage: 'parsed_append',
      payload: {
        text,
        meta,
        options,
      },
    });
    appendChain = appendChain
      .then(() => host.appendAgentMessage(session.id, text, meta, options))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`failed to persist codex app-server event: ${message}`);
      });
  };

  const sendJsonRpc = (payload: Record<string, unknown>): Promise<void> => new Promise((resolve, reject) => {
    if (socket.readyState !== 1) {
      reject(new Error('codex app-server websocket is not open'));
      return;
    }

    try {
      socket.send(JSON.stringify(payload));
      resolve();
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });

  const sendJsonRpcResult = async (id: JsonRpcId | unknown, result: Record<string, unknown>) => {
    await sendJsonRpc({
      jsonrpc: '2.0',
      id,
      result,
    });
  };

  const sendJsonRpcError = async (id: JsonRpcId | unknown, code: number, message: string) => {
    await sendJsonRpc({
      jsonrpc: '2.0',
      id,
      error: {
        code,
        message,
      },
    });
  };

  const sendRequest = <T extends Record<string, unknown> = Record<string, unknown>>(
    method: string,
    params: Record<string, unknown>,
  ): Promise<T> => new Promise((resolve, reject) => {
    const requestId = `aris-rpc-${requestSequence += 1}`;
    const requestKey = toJsonRpcIdKey(requestId);
    pendingRequests.set(requestKey, {
      method,
      resolve: (result) => resolve(result as T),
      reject,
    });

    void sendJsonRpc({
      jsonrpc: '2.0',
      id: requestId,
      method,
      params,
    }).catch((error) => {
      pendingRequests.delete(requestKey);
      reject(error instanceof Error ? error : new Error(String(error)));
    });
  });

  const registerPermissionResponder = async (
    key: string,
    command: string,
    reason: string,
    risk: PermissionRisk,
    responder: (decision: PermissionDecision) => Promise<void>,
  ) => {
    const knownPermissionId = host.permissionRouter.lookupCodexBinding(key);
    if (knownPermissionId) {
      const knownPermission = host.permissionRouter.getCachedPermission(knownPermissionId);
      if (knownPermission?.state === 'pending') {
        if (host.coordinationStore) {
          host.permissionRouter.watchExternal({
            permissionId: knownPermissionId,
            responder,
            signal,
          });
        } else {
          host.permissionRouter.registerCodexResponder(knownPermissionId, responder);
        }
        runtimePermissionIds.add(knownPermissionId);
        if (autoApproveAll) {
          await host.decidePermission(knownPermissionId, 'allow_session');
        }
        return;
      }
      host.permissionRouter.clearCodexBinding(key);
    }

    const created = await host.createPermission({
      sessionId: session.id,
      ...(chatId ? { chatId } : {}),
      agent: session.metadata.flavor === 'codex' ? 'codex' : 'unknown',
      command,
      reason,
      risk,
    });

    host.permissionRouter.registerCodexBinding(key, created.id);
    if (host.coordinationStore) {
      host.permissionRouter.watchExternal({
        permissionId: created.id,
        responder,
        signal,
      });
    } else {
      host.permissionRouter.registerCodexResponder(created.id, responder);
    }
    runtimePermissionIds.add(created.id);
    if (autoApproveAll) {
      await host.decidePermission(created.id, 'allow_session');
    }
  };

  const handleServerRequest = async (payload: Record<string, unknown>): Promise<void> => {
    const method = asString(payload.method, '').trim();
    const requestId = payload.id;
    const params = asRecord(payload.params) ?? {};
    const requestIdKey = toJsonRpcIdKey(requestId);

    const approval = extractCodexAppServerApproval({
      method,
      params,
      requestIdKey,
      sessionId: session.id,
    });
    if (approval) {
      await registerPermissionResponder(
        buildScopedPermissionKey(approval.permissionKey, chatId),
        approval.command,
        approval.reason,
        approval.risk,
        (decision) => sendJsonRpcResult(requestId, { decision: approval.mapDecision(decision) }),
      );
      return;
    }

    if (method === 'mcpServer/elicitation/request') {
      await sendJsonRpcResult(requestId, { action: 'cancel', content: null });
      return;
    }

    if (method === 'item/tool/requestUserInput') {
      await sendJsonRpcResult(requestId, { answers: {} });
      return;
    }

    await sendJsonRpcError(requestId, -32601, `Unsupported server request method: ${method}`);
  };

  const handleServerNotification = (payload: Record<string, unknown>) => {
    const method = asString(payload.method, '').trim();
    const params = asRecord(payload.params) ?? {};

    if (method === 'thread/started') {
      const threadRecord = asRecord(params.thread);
      const startedThreadId = asString(threadRecord?.id, '').trim();
      if (startedThreadId) {
        resolvedThreadId = startedThreadId;
        host.codexThreads.set(threadCacheKey, startedThreadId);
      }
      return;
    }

    if (method === 'item/agentMessage/delta') {
      const deltaRecord = asRecord(params.delta);
      const deltaText = asString(
        params.text,
        asString(params.delta, asString(deltaRecord?.text, asString(deltaRecord?.delta, ''))),
      );
      if (deltaText) {
        pendingAgentMessage += deltaText;
        lastAgentMessage = pendingAgentMessage.trim();
      }
      return;
    }

    if (method === 'item/completed') {
      const item = asRecord(params.item);
      if (!item) {
        return;
      }

      const itemType = asString(item.type, '');
      if (itemType === 'agentMessage') {
        const text = sanitizeAgentMessageText(asString(item.text, '').trim());
        if (!text) {
          return;
        }
        const itemTurnId = asString(params.turnId, activeTurnId).trim() || activeTurnId;
        if (shouldSkipDuplicateAgentMessage(persistedAgentMessageKeys, itemTurnId, text)) {
          return;
        }
        pendingAgentMessage = text;
        lastAgentMessage = text;
        streamedPersisted = true;
        agentMessagePersisted = true;
        enqueueAppend(
          text,
          {
            ...(chatId ? { chatId } : {}),
            requestedPath: session.metadata.path,
            execCwd: safeCwd,
            streamEvent: 'agent_message',
            ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
          },
          { type: 'message', title: 'Text Reply' },
        );
        return;
      }

      const fileWrite = inferCodexFileWriteItem(item);
      if (fileWrite) {
        const bodyParts = [`$ ${fileWrite.command || 'apply_patch'}`];
        if (fileWrite.path) {
          bodyParts.push(`path: ${fileWrite.path}`);
        }
        if (fileWrite.detail) {
          bodyParts.push(fileWrite.detail);
        }
        if (shouldDisplayToolStatus(fileWrite.status)) {
          bodyParts.push(`status: ${fileWrite.status}`);
        }

        streamedPersisted = true;
        enqueueAppend(
          bodyParts.join('\n'),
          {
            ...(chatId ? { chatId } : {}),
            requestedPath: session.metadata.path,
            execCwd: safeCwd,
            actionType: 'file_write',
            normalizedActionKind: 'file_write',
            command: fileWrite.command,
            path: fileWrite.path,
            additions: fileWrite.additions,
            deletions: fileWrite.deletions,
            hasDiffSignal: fileWrite.hasDiffSignal,
            streamEvent: 'file_change',
            ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
          },
          { type: 'tool', title: 'File Write' },
        );
        return;
      }

      if (itemType !== 'commandExecution') {
        return;
      }

      const commandRaw = asString(item.command, '').trim();
      const command = unwrapShellCommand(commandRaw);
      const output = stripAnsi(asString(item.aggregatedOutput, '')).trim();
      const exitCodeValue = item.exitCode;
      const exitCode = typeof exitCodeValue === 'number' && Number.isFinite(exitCodeValue)
        ? exitCodeValue
        : null;
      const actionType = inferActionTypeFromCommand(command);
      const diffStats = actionType === 'file_write'
        ? summarizeDiffText(output)
        : { additions: 0, deletions: 0, hasDiffSignal: false };
      const title = titleForActionType(actionType);
      const bodyParts = [`$ ${command || 'command'}`];
      if (output) {
        bodyParts.push(output);
      }
      if (exitCode !== null) {
        bodyParts.push(`exit code: ${exitCode}`);
      }
      const status = asString(item.status, '').trim();
      if (shouldDisplayToolStatus(status)) {
        bodyParts.push(`status: ${status}`);
      }
      const body = bodyParts.join('\n');

      streamedPersisted = true;
      enqueueAppend(
        body,
        {
          ...(chatId ? { chatId } : {}),
          requestedPath: session.metadata.path,
          execCwd: safeCwd,
          actionType,
          normalizedActionKind: actionType,
          command,
          exitCode: exitCode ?? undefined,
          additions: diffStats.additions,
          deletions: diffStats.deletions,
          hasDiffSignal: diffStats.hasDiffSignal,
          streamEvent: 'command_execution',
          ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
        },
        {
          type: 'tool',
          title,
        },
      );
      return;
    }

    if (method === 'turn/completed') {
      if (!agentMessagePersisted) {
        const recoveredText = sanitizeAgentMessageText(pendingAgentMessage.trim());
        if (recoveredText) {
          lastAgentMessage = recoveredText;
          streamedPersisted = true;
          agentMessagePersisted = true;
          enqueueAppend(
            recoveredText,
            {
              ...(chatId ? { chatId } : {}),
              requestedPath: session.metadata.path,
              execCwd: safeCwd,
              streamEvent: 'agent_message_recovered',
              ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
            },
            { type: 'message', title: 'Text Reply' },
          );
        }
      }

      const turn = asRecord(params.turn);
      const completedTurnId = asString(turn?.id, '').trim();
      if (activeTurnId && completedTurnId && activeTurnId !== completedTurnId) {
        return;
      }

      const status = asString(turn?.status, '').trim() || 'completed';
      const errorMessage = asString(asRecord(turn?.error)?.message, '').trim() || undefined;
      host.runtimeEventLogger.logParsed({
        sessionId: session.id,
        agent: 'codex',
        ...(chatId ? { chatId } : {}),
        model: selectedModel,
        turnStatus: status,
        channel: 'app_server',
        stage: 'turn_status',
        payload: {
          turnId: completedTurnId || undefined,
          threadId: resolvedThreadId || undefined,
          ...(errorMessage ? { errorMessage } : {}),
        },
      });
      turnCompleted = true;
      resolveTurnCompletion?.({ status, errorMessage });
    }
  };

  const handleIncomingPayloadText = (rawText: string) => {
    transportActivityTick += 1;
    lastTransportActivityAt = Date.now();
    const rawLine = rawText.trim();
    host.runtimeEventLogger.logRaw({
      sessionId: session.id,
      agent: 'codex',
      ...(chatId ? { chatId } : {}),
      model: selectedModel,
      channel: 'app_server',
      line: rawLine,
    });
    const payload = parseJsonLine(rawLine);
    if (!payload) {
      host.runtimeEventLogger.logParsed({
        sessionId: session.id,
        agent: 'codex',
        ...(chatId ? { chatId } : {}),
        model: selectedModel,
        channel: 'app_server',
        stage: 'incoming_payload',
        payload: { parseError: 'invalid_json' },
      });
      return;
    }
    host.runtimeEventLogger.logParsed({
      sessionId: session.id,
      agent: 'codex',
      ...(chatId ? { chatId } : {}),
      model: selectedModel,
      channel: 'app_server',
      stage: 'incoming_payload',
      payload,
    });

    const messageMethod = typeof payload.method === 'string' ? payload.method : '';
    const hasId = Object.prototype.hasOwnProperty.call(payload, 'id');

    if (messageMethod && hasId) {
      permissionChain = permissionChain
        .then(() => handleServerRequest(payload))
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`failed to handle codex app-server request: ${message}`);
        });
      return;
    }

    if (messageMethod) {
      handleServerNotification(payload);
      return;
    }

    if (!hasId) {
      return;
    }

    const idKey = toJsonRpcIdKey(payload.id);
    const pending = pendingRequests.get(idKey);
    if (!pending) {
      return;
    }
    pendingRequests.delete(idKey);

    const errorPayload = asRecord(payload.error);
    if (errorPayload) {
      const rpcMessage = asString(errorPayload.message, `JSON-RPC ${pending.method} failed`);
      pending.reject(new Error(rpcMessage));
      return;
    }

    const resultPayload = asRecord(payload.result) ?? {};
    pending.resolve(resultPayload);
  };

  socket.addEventListener('message', (event) => {
    handleIncomingPayloadText(normalizeCodexAppServerMessageData(event.data));
  });
  socket.addEventListener('close', () => {
    rejectCodexAppServerPendingRequests(pendingRequests, 'codex app-server websocket closed before turn completion');
  });

  const closeChild = async () => {
    try {
      socket.close(1000, 'turn-complete');
    } catch {
      // ignore websocket close failures during shutdown
    }
    const pseudoChild = { pid: appServerPid, killed: false, kill: () => false };
    terminateCodexAppServerProcess(pseudoChild, process.kill, 'SIGTERM');
    await new Promise((resolve) => setTimeout(resolve, 250));
    terminateCodexAppServerProcess(pseudoChild, process.kill, 'SIGKILL');
  };

  const waitForPostTurnDrain = async () => {
    const drainDeadline = Date.now() + CODEX_APP_SERVER_POST_TURN_DRAIN_TIMEOUT_MS;

    while (Date.now() < drainDeadline) {
      await waitForStableActivity({
        getActivityTick: () => transportActivityTick,
        getLastActivityAt: () => lastTransportActivityAt,
        quietMs: CODEX_APP_SERVER_POST_TURN_QUIET_MS,
        timeoutMs: Math.max(10, drainDeadline - Date.now()),
      });

      const activityTickSnapshot = transportActivityTick;
      const appendSnapshot = appendChain;
      const permissionSnapshot = permissionChain;
      await appendSnapshot;
      await permissionSnapshot;

      if (
        activityTickSnapshot === transportActivityTick
        && appendSnapshot === appendChain
        && permissionSnapshot === permissionChain
        && Date.now() - lastTransportActivityAt >= CODEX_APP_SERVER_POST_TURN_QUIET_MS
      ) {
        return;
      }
    }

    await appendChain;
    await permissionChain;
  };

  try {
    await sendRequest('initialize', {
      clientInfo: {
        name: 'aris-runtime',
        title: 'ARIS Runtime',
        version: '0.1.0',
      },
      capabilities: {
        experimentalApi: true,
        optOutNotificationMethods: [
          'item/commandExecution/outputDelta',
          'item/commandExecution/terminalInteraction',
        ],
      },
    });
    await sendJsonRpc({
      jsonrpc: '2.0',
      method: 'initialized',
      params: {},
    });

    if (resolvedThreadId) {
      const resumed = await sendRequest('thread/resume', {
        threadId: resolvedThreadId,
        cwd: safeCwd,
        approvalPolicy: codexApprovalPolicy,
        sandbox: effectiveSandboxMode,
        persistExtendedHistory: true,
      });
      const resumedThreadId = asString(asRecord(resumed.thread)?.id, '').trim();
      if (resumedThreadId) {
        resolvedThreadId = resumedThreadId;
        host.codexThreads.set(threadCacheKey, resumedThreadId);
      }
    } else {
      const started = await sendRequest('thread/start', {
        cwd: safeCwd,
        approvalPolicy: codexApprovalPolicy,
        sandbox: effectiveSandboxMode,
        experimentalRawEvents: false,
        persistExtendedHistory: true,
      });
      const startedThreadId = asString(asRecord(started.thread)?.id, '').trim();
      if (startedThreadId) {
        resolvedThreadId = startedThreadId;
        host.codexThreads.set(threadCacheKey, startedThreadId);
      }
    }

    if (!resolvedThreadId) {
      throw new Error('codex app-server did not return a thread id');
    }

    const turnStarted = await sendRequest('turn/start', {
      threadId: resolvedThreadId,
      input: [
        {
          type: 'text',
          text: prompt,
          text_elements: [],
        },
      ],
      approvalPolicy: codexApprovalPolicy,
    });
    activeTurnId = asString(asRecord(turnStarted.turn)?.id, '').trim();
    host.runtimeEventLogger.logParsed({
      sessionId: session.id,
      agent: 'codex',
      ...(chatId ? { chatId } : {}),
      model: selectedModel,
      turnStatus: 'turn_started',
      channel: 'app_server',
      stage: 'turn_status',
      payload: {
        turnId: activeTurnId || undefined,
        threadId: resolvedThreadId || undefined,
        timeoutMs: CODEX_TURN_TIMEOUT_MS,
      },
    });

    let turnTimeout: NodeJS.Timeout | undefined;
    const completion = await Promise.race([
      turnCompletion,
      ...(abortController.interrupted ? [abortController.interrupted] : []),
      transportClosed,
      new Promise<{ status: string; errorMessage?: string }>((_resolve, reject) => {
        turnTimeout = setTimeout(() => {
          runStatus = 'timed_out';
          runErrorMessage = `turn timeout exceeded (${CODEX_TURN_TIMEOUT_MS}ms)`;
          reject(new Error(`codex app-server turn timed out after ${CODEX_TURN_TIMEOUT_MS}ms`));
        }, CODEX_TURN_TIMEOUT_MS);
      }),
    ]).finally(() => {
      if (turnTimeout) {
        clearTimeout(turnTimeout);
      }
    });

    await appendChain;
    await permissionChain;

    const finalText = sanitizeAgentMessageText(lastAgentMessage.trim());
    if (signal?.aborted || completion.status === 'interrupted') {
      runStatus = 'aborted';
      return {
        output: trimOutput(finalText),
        cwd: safeCwd,
        streamedPersisted,
        agentMessagePersisted,
        threadId: resolvedThreadId || undefined,
      };
    }

    if (completion.status === 'failed' && !finalText) {
      const suffix = completion.errorMessage ? `: ${completion.errorMessage}` : '';
      runStatus = 'failed';
      runErrorMessage = completion.errorMessage;
      throw new Error(`codex app-server turn failed${suffix}`);
    }

    runStatus = 'completed';
    return {
      output: trimOutput(finalText),
      cwd: safeCwd,
      streamedPersisted,
      agentMessagePersisted,
      threadId: resolvedThreadId || undefined,
    };
  } catch (error) {
    const failure = classifyCodexAppServerFailure(error);
    if (runStatus === 'running') {
      runStatus = signal?.aborted ? 'aborted' : 'failed';
      runErrorMessage = failure.detail;
    }
    runFailureKind = failure.kind;
    throw error;
  } finally {
    abortController.dispose();
    rejectCodexAppServerPendingRequests(pendingRequests, 'The operation was aborted');

    await permissionChain.catch(() => undefined);
    await appendChain.catch(() => undefined);

    await host.permissionRouter.finalizeCodexPermissions(runtimePermissionIds, {
      preservePending: host.activeRunRegistry.isDraining() && !signal?.aborted,
    });

    if (!turnCompleted && !signal?.aborted) {
      if (runStatus === 'running') {
        runStatus = 'failed';
        runErrorMessage = 'turn did not complete before process close';
        runFailureKind = 'websocket_closed';
      }
      host.runtimeEventLogger.logParsed({
        sessionId: session.id,
        agent: 'codex',
        ...(chatId ? { chatId } : {}),
        model: selectedModel,
        turnStatus: 'turn_incomplete',
        channel: 'app_server',
        stage: 'turn_status',
        payload: {
          threadId: resolvedThreadId || undefined,
          turnId: activeTurnId || undefined,
          listenUrl,
          appServerPid,
          ...(runFailureKind ? { failureKind: runFailureKind } : {}),
          ...(runErrorMessage ? { errorMessage: runErrorMessage } : {}),
        },
      });
      if (runFailureKind === 'websocket_closed' || (!runFailureKind && runStatus === 'failed')) {
        console.error(`codex app-server transport closed early; pid=${appServerPid} listenUrl=${listenUrl}`);
      }
    }
    host.runtimeEventLogger.logParsed({
      sessionId: session.id,
      agent: 'codex',
      ...(chatId ? { chatId } : {}),
      model: selectedModel,
      turnStatus: runStatus,
      channel: 'app_server',
      stage: 'run_status',
      payload: {
        threadId: resolvedThreadId || undefined,
        turnId: activeTurnId || undefined,
        turnCompleted,
        ...(runFailureKind ? { failureKind: runFailureKind } : {}),
        ...(runErrorMessage ? { errorMessage: runErrorMessage } : {}),
      },
    });

    await closeChild();
  }
}

export async function runCodexExecCli(
  host: CodexRuntimeHost,
  session: RuntimeSession,
  prompt: string,
  signal?: AbortSignal,
  threadId?: string,
  chatId?: string,
  model?: string,
  modelReasoningEffort?: ModelReasoningEffort,
): Promise<{ output: string; cwd: string; streamedPersisted: boolean; agentMessagePersisted: boolean; threadId?: string }> {
  const safeCwd = host.resolveExecutionCwd(session.metadata.path);
  const threadCacheKey = buildCodexThreadCacheKey(session.id, chatId);
  const sessionApprovalPolicy = host.resolveSessionApprovalPolicy(session);
  const selectedModel = normalizeModel(model) ?? resolveRuntimeModelSelection({
    agent: 'codex',
    sessionModel: session.metadata.model,
  }).model;
  const selectedReasoningEffort = normalizeModelReasoningEffort(modelReasoningEffort);
  const autoApproveAll = sessionApprovalPolicy === 'yolo';
  const mergedPath = `${process.env.PATH || ''}:${AGENT_EXTRA_PATHS}`;
  const command = buildCodexCommand({
    prompt,
    approvalPolicy: sessionApprovalPolicy,
    ...(selectedModel ? { model: selectedModel } : {}),
    ...(selectedReasoningEffort ? { reasoningEffort: selectedReasoningEffort } : {}),
    channel: 'exec',
    ...(threadId ? { threadId } : {}),
  });
  const args = command.args;
  const child = spawn(command.command, args, {
    cwd: safeCwd,
    env: { ...process.env, PATH: mergedPath },
    stdio: ['pipe', 'pipe', 'pipe'],
    signal,
  });
  host.runtimeEventLogger.logParsed({
    sessionId: session.id,
    agent: 'codex',
    ...(chatId ? { chatId } : {}),
    model: selectedModel,
    turnStatus: 'run_started',
    channel: 'exec_cli',
    stage: 'run_status',
    payload: {
      mode: 'exec',
      args,
    },
  });

  const stdoutLines = createInterface({ input: child.stdout });
  let stderr = '';
  let appendChain: Promise<void> = Promise.resolve();
  let permissionChain: Promise<void> = Promise.resolve();
  let lastAgentMessage = '';
  let streamedPersisted = false;
  let agentMessagePersisted = false;
  let resolvedThreadId = typeof threadId === 'string' && threadId.trim().length > 0
    ? threadId.trim()
    : '';
  const persistedAgentMessageKeys = new Set<string>();

  const enqueueAppend = (
    text: string,
    meta: Record<string, unknown>,
    options: { type?: string; title?: string } = {},
  ) => {
    host.runtimeEventLogger.logParsed({
      sessionId: session.id,
      agent: 'codex',
      ...(chatId ? { chatId } : {}),
      model: selectedModel,
      channel: 'exec_cli',
      stage: 'parsed_append',
      payload: {
        text,
        meta,
        options,
      },
    });
    appendChain = appendChain
      .then(() => host.appendAgentMessage(session.id, text, meta, options))
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`failed to persist codex stream event: ${message}`);
      });
  };

  child.stderr.on('data', (chunk: Buffer | string) => {
    stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
  });

  const enqueuePermission = (request: CodexPermissionRequest) => {
    permissionChain = permissionChain
      .then(async () => {
        const key = buildScopedPermissionKey(buildCodexPermissionKey(session.id, request), chatId);
        const knownPermissionId = host.permissionRouter.lookupCodexBinding(key);
        if (knownPermissionId) {
          const knownPermission = host.permissionRouter.getCachedPermission(knownPermissionId);
          if (knownPermission?.state === 'pending') {
            if (autoApproveAll) {
              await host.decidePermission(knownPermissionId, 'allow_session');
            }
            return;
          }
          host.permissionRouter.clearCodexBinding(key);
        }

        const created = await host.createPermission({
          sessionId: session.id,
          ...(chatId ? { chatId } : {}),
          agent: session.metadata.flavor === 'codex' ? 'codex' : 'unknown',
          command: request.command,
          reason: request.reason,
          risk: request.risk,
        });

        host.permissionRouter.registerCodexBinding(key, created.id);
        if (autoApproveAll) {
          await host.decidePermission(created.id, 'allow_session');
        }
      })
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`failed to create codex permission request: ${message}`);
      });
  };

  stdoutLines.on('line', (line) => {
    const rawLine = line.trim();
    host.runtimeEventLogger.logRaw({
      sessionId: session.id,
      agent: 'codex',
      ...(chatId ? { chatId } : {}),
      model: selectedModel,
      channel: 'exec_cli',
      line: rawLine,
    });
    const payload = parseJsonLine(rawLine);
    if (!payload) {
      host.runtimeEventLogger.logParsed({
        sessionId: session.id,
        agent: 'codex',
        ...(chatId ? { chatId } : {}),
        model: selectedModel,
        channel: 'exec_cli',
        stage: 'incoming_payload',
        payload: { parseError: 'invalid_json' },
      });
      return;
    }
    host.runtimeEventLogger.logParsed({
      sessionId: session.id,
      agent: 'codex',
      ...(chatId ? { chatId } : {}),
      model: selectedModel,
      channel: 'exec_cli',
      stage: 'incoming_payload',
      payload,
    });

    if (payload.type === 'thread.started') {
      const startedThreadId = asString(payload.thread_id, '').trim();
      if (startedThreadId) {
        resolvedThreadId = startedThreadId;
        host.codexThreads.set(threadCacheKey, startedThreadId);
      }
      return;
    }

    const approvalRequest = extractCodexPermissionRequest(payload);
    if (approvalRequest) {
      enqueuePermission(approvalRequest);
      return;
    }

    if (payload.type !== 'item.completed') {
      return;
    }

    const item = asRecord(payload.item);
    if (!item) {
      return;
    }

    const itemType = asString(item.type, '');
    if (itemType === 'agent_message') {
      const text = sanitizeAgentMessageText(asString(item.text, '').trim());
      if (text) {
        const itemTurnId = asString(
          payload.turn_id,
          asString(payload.turnId, asString(item.turn_id, asString(item.turnId, ''))),
        ).trim();
        if (shouldSkipDuplicateAgentMessage(persistedAgentMessageKeys, itemTurnId, text)) {
          return;
        }
        lastAgentMessage = text;
        streamedPersisted = true;
        agentMessagePersisted = true;
        enqueueAppend(
          text,
          {
            ...(chatId ? { chatId } : {}),
            requestedPath: session.metadata.path,
            execCwd: safeCwd,
            streamEvent: 'agent_message',
            ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
          },
          { type: 'message', title: 'Text Reply' },
        );
      }
      return;
    }

    const fileWrite = inferCodexFileWriteItem(item);
    if (fileWrite) {
      const bodyParts = [`$ ${fileWrite.command || 'apply_patch'}`];
      if (fileWrite.path) {
        bodyParts.push(`path: ${fileWrite.path}`);
      }
      if (fileWrite.detail) {
        bodyParts.push(fileWrite.detail);
      }
      if (shouldDisplayToolStatus(fileWrite.status)) {
        bodyParts.push(`status: ${fileWrite.status}`);
      }

      streamedPersisted = true;
      enqueueAppend(
        bodyParts.join('\n'),
        {
          ...(chatId ? { chatId } : {}),
          requestedPath: session.metadata.path,
          execCwd: safeCwd,
          actionType: 'file_write',
          normalizedActionKind: 'file_write',
          command: fileWrite.command,
          path: fileWrite.path,
          additions: fileWrite.additions,
          deletions: fileWrite.deletions,
          hasDiffSignal: fileWrite.hasDiffSignal,
          streamEvent: 'file_change',
          ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
        },
        { type: 'tool', title: 'File Write' },
      );
      return;
    }

    if (itemType !== 'command_execution') {
      return;
    }

    const commandRaw = asString(item.command, '').trim();
    const command = unwrapShellCommand(commandRaw);
    const output = stripAnsi(asString(item.aggregated_output, '')).trim();
    const exitCodeValue = item.exit_code;
    const exitCode = typeof exitCodeValue === 'number' && Number.isFinite(exitCodeValue)
      ? exitCodeValue
      : null;
    const actionType = inferActionTypeFromCommand(command);
    const diffStats = actionType === 'file_write'
      ? summarizeDiffText(output)
      : { additions: 0, deletions: 0, hasDiffSignal: false };
    const title = titleForActionType(actionType);
    const bodyParts = [`$ ${command || 'command'}`];
    if (output) {
      bodyParts.push(output);
    }
    if (exitCode !== null) {
      bodyParts.push(`exit code: ${exitCode}`);
    }
    const body = bodyParts.join('\n');

    streamedPersisted = true;
    enqueueAppend(
      body,
      {
        ...(chatId ? { chatId } : {}),
        requestedPath: session.metadata.path,
        execCwd: safeCwd,
        actionType,
        normalizedActionKind: actionType,
        command,
        exitCode: exitCode ?? undefined,
        additions: diffStats.additions,
        deletions: diffStats.deletions,
        hasDiffSignal: diffStats.hasDiffSignal,
        streamEvent: 'command_execution',
        ...(resolvedThreadId ? { threadId: resolvedThreadId } : {}),
      },
      {
        type: 'tool',
        title,
      },
    );
  });

  const result = await new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
    child.once('error', reject);
    child.once('close', (code, signal) => resolve({ code, signal }));
  });

  await appendChain;
  await permissionChain;

  const finalText = sanitizeAgentMessageText(lastAgentMessage.trim());
  if (signal?.aborted) {
    host.runtimeEventLogger.logParsed({
      sessionId: session.id,
      agent: 'codex',
      ...(chatId ? { chatId } : {}),
      model: selectedModel,
      turnStatus: 'aborted',
      channel: 'exec_cli',
      stage: 'run_status',
      payload: {
        threadId: resolvedThreadId || undefined,
      },
    });
    return {
      output: trimOutput(finalText),
      cwd: safeCwd,
      streamedPersisted,
      agentMessagePersisted,
      threadId: resolvedThreadId || undefined,
    };
  }

  if (result.code !== 0 && !finalText) {
    const detail = stripAnsi(stderr).slice(0, 800) || `exit code ${result.code}`;
    host.runtimeEventLogger.logParsed({
      sessionId: session.id,
      agent: 'codex',
      ...(chatId ? { chatId } : {}),
      model: selectedModel,
      turnStatus: 'failed',
      channel: 'exec_cli',
      stage: 'run_status',
      payload: {
        threadId: resolvedThreadId || undefined,
        exitCode: result.code,
        errorMessage: detail,
      },
    });
    throw new Error(`codex CLI failed: ${detail}`);
  }

  host.runtimeEventLogger.logParsed({
    sessionId: session.id,
    agent: 'codex',
    ...(chatId ? { chatId } : {}),
    model: selectedModel,
    turnStatus: 'completed',
    channel: 'exec_cli',
    stage: 'run_status',
    payload: {
      threadId: resolvedThreadId || undefined,
      exitCode: result.code,
    },
  });
  return {
    output: trimOutput(finalText),
    cwd: safeCwd,
    streamedPersisted,
    agentMessagePersisted,
    threadId: resolvedThreadId || undefined,
  };
}

export async function resolveCodexThreadId(host: CodexRuntimeHost, sessionId: string, chatId?: string): Promise<string | undefined> {
  const cacheKey = buildCodexThreadCacheKey(sessionId, chatId);
  const cached = host.codexThreads.get(cacheKey);
  if (cached) {
    return cached;
  }

  try {
    const history = await host.listMessages(sessionId);
    for (let index = history.length - 1; index >= 0; index -= 1) {
      if (chatId) {
        const rawChatId = history[index]?.meta?.chatId;
        const messageChatId = typeof rawChatId === 'string' ? rawChatId.trim() : '';
        if (messageChatId !== chatId) {
          continue;
        }
      }
      const candidate = history[index]?.meta?.threadId;
      if (typeof candidate !== 'string') {
        continue;
      }
      const trimmed = candidate.trim();
      if (!trimmed) {
        continue;
      }
      host.codexThreads.set(cacheKey, trimmed);
      return trimmed;
    }
  } catch {
    // Ignore thread recovery failures and start a new Codex thread.
  }

  return undefined;
}
