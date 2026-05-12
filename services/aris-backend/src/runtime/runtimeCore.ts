import { randomUUID } from 'node:crypto';
import { execFile, spawn, type SpawnOptionsWithoutStdio } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:net';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { inferActionTypeFromCommand, titleForActionType } from './actionType.js';
import { sanitizeAgentMessageText, shouldDisplayToolStatus } from './agentMessageSanitizer.js';
import { summarizeDiffText, summarizeFileChangeDiff } from './diffStats.js';
import { RuntimeEventLogger } from './runtimeEventLogger.js';
import { resolveRuntimeModelSelection } from './modelPolicy.js';
import { recoverClaudeThreadIdFromMessages, runClaudeProviderTurn } from './providers/claude/claudeOrchestrator.js';
import {
  buildClaudeSessionHintMeta as buildSessionHintMeta,
} from './providers/claude/claudeEventBridge.js';
import { ClaudeMessageQueue } from './providers/claude/claudeMessageQueue.js';
import { extractClaudePermissionRequest } from './providers/claude/claudePermissionBridge.js';
import { looksLikeClaudeActionTranscript, parseClaudeStreamLine, parseClaudeStreamOutput } from './providers/claude/claudeProtocolMapper.js';
import { TurnProgressTracker } from './providers/claude/turnProgressTracker.js';
import { ClaudeSessionRegistry } from './providers/claude/claudeSessionRegistry.js';
import { ClaudeSessionLogTracker, extractClaudeSessionHintIds } from './providers/claude/claudeSessionScanner.js';
import { buildClaudeSessionId } from './providers/claude/claudeSessionSource.js';
import { GeminiMessageQueue } from './providers/gemini/geminiMessageQueue.js';
import { inspectGeminiAcpSessionCapabilities, runGeminiAcpTurn } from './providers/gemini/geminiAcpClient.js';
import { buildGeminiProviderTextEvent } from './providers/gemini/geminiEventBridgeV2.js';
import { looksLikeGeminiActionTranscript, parseGeminiStreamLine, parseGeminiStreamOutput } from './providers/gemini/geminiProtocolMapper.js';
import { createGeminiRuntime } from './providers/gemini/geminiRuntime.js';
import { GeminiStreamAdapter } from './providers/gemini/geminiStreamAdapter.js';
import { GeminiSessionRegistry } from './providers/gemini/geminiSessionRegistry.js';
import { buildProviderCommand, type ProviderCommand } from './providers/providerCommandFactory.js';
import {
  buildCodexAppServerListenUrl,
  connectCodexAppServerSocket,
  normalizeCodexAppServerMessageData,
  reserveCodexAppServerPort,
  type CodexAppServerSocket,
} from './providers/codex/codexAppServerClient.js';
import {
  buildCodexAppServerSpawnOptions,
  createCodexAppServerAbortPromise,
  launchDetachedCodexAppServerProcess,
  rejectCodexAppServerPendingRequests,
  terminateCodexAppServerProcess,
} from './providers/codex/codexAppServerLifecycle.js';
import {
  extractCodexAppServerApproval,
  normalizeCodexApprovalPolicy,
} from './providers/codex/codexPermissionBridge.js';
import {
  CODEX_RUNTIME_MODE,
  resolveCodexThreadId,
  runCodexCli,
  type CodexRuntimeHost,
} from './providers/codex/codexRuntime.js';
import {
  buildCodexPermissionKey,
  buildCodexThreadCacheKey,
  classifyCodexAppServerFailure,
  extractCodexPermissionRequest,
  isMissingCodexThreadError,
  inferCodexFileWriteItem,
  type CodexAppServerFailureInfo,
  type CodexAppServerFailureKind,
} from './providers/codex/codexProtocolMapper.js';
import type { CodexPermissionRequest } from './providers/codex/types.js';
import type { SessionProtocolEnvelope } from './contracts/sessionProtocol.js';
import type {
  ProviderActionEvent,
  ProviderPermissionRequest,
  ProviderRuntimeFlavor,
  ProviderRuntimeSession,
  ProviderTextEvent,
} from './contracts/providerRuntime.js';
import type {
  HappyRuntimePermissionInput,
  RuntimeCoordinationStore,
} from './contracts/runtimeCoordinationStore.js';
import { PermissionRouter, buildScopedPermissionKey } from './orchestration/permissionRouter.js';
import { RealtimeEventBus } from './orchestration/realtimeEventBus.js';
import {
  ActiveRunRegistry,
  buildRunKey,
  isSessionRunKey,
  type ActiveRun,
  type StaleRunCleanupInput,
} from './orchestration/activeRunRegistry.js';
import type { ClaudeSessionLaunchMode } from './providers/claude/claudeSessionContract.js';
import type { ClaudeActionEvent, ClaudeLaunchCommand, ClaudeResumeTarget, ClaudeTextEvent } from './providers/claude/types.js';
import type {
  ApprovalPolicy,
  GeminiSessionCapabilities,
  PermissionDecision,
  PermissionRequest,
  PermissionRisk,
  RuntimeMessage,
  RuntimeSession,
  SessionAction,
} from '../types.js';
import { computeWorktreePath } from './worktreeManager.js';

const execFileAsync = promisify(execFile);
const AGENT_COMMAND_TIMEOUT_MS = 120_000;
const CLAUDE_TURN_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.CLAUDE_TURN_TIMEOUT_MS || '', 10);
  if (Number.isFinite(parsed) && parsed >= 120_000) {
    return parsed;
  }
  return 30 * 60 * 1000; // 30 minutes
})();
const GEMINI_TURN_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.GEMINI_TURN_TIMEOUT_MS || '', 10);
  if (Number.isFinite(parsed) && parsed >= 120_000) {
    return parsed;
  }
  return 15 * 60 * 1000; // 15 minutes
})();
function resolveGeminiStreamBackendV2Enabled(value?: string): boolean {
  return !['0', 'false', 'off'].includes((value || '1').trim().toLowerCase());
}
const GEMINI_STREAM_BACKEND_V2 = resolveGeminiStreamBackendV2Enabled(process.env.GEMINI_STREAM_BACKEND_V2);
const AGENT_MAX_OUTPUT_CHARS = 32_000;
const AGENT_EXTRA_PATHS = [
  '/home/ubuntu/.local/bin',
  '/home/ubuntu/.nvm/versions/node/v22.17.1/bin',
].join(':');
const DEFAULT_APPROVAL_POLICY = normalizeApprovalPolicy(process.env.CODEX_APPROVAL_POLICY, 'on-request');
const HAPPY_MESSAGES_BATCH_LIMIT = 500;
const HAPPY_MESSAGES_PAGE_MAX_LIMIT = 2000;
const HAPPY_MESSAGES_MAX_PAGES = 1000;
const HAPPY_EVENT_LOG_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
  '..',
  '..',
  '..',
  'logs',
);
const HAPPY_EVENT_LOG_MAX_BYTES = (() => {
  const parsed = Number.parseInt(process.env.HAPPY_EVENT_LOG_MAX_BYTES || '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 1_024 * 1_024 * 1_024; // 1GB
})();
const HAPPY_MESSAGE_WRITE_BASE_DELAY_MS = 50;
const HAPPY_MESSAGE_WRITE_MAX_RETRIES = 3;
const STALE_RUN_TIMEOUT_MS = (() => {
  const parsed = Number.parseInt(process.env.HAPPY_STALE_RUN_TIMEOUT_MS || '', 10);
  if (Number.isFinite(parsed) && parsed >= 60_000) {
    return parsed;
  }
  return 45 * 60 * 1000; // 45 minutes
})();
const UNPARSED_HAPPY_PAYLOAD_PREFIX = '[UNPARSED HAPPY PAYLOAD]';

type RuntimeAgent = RuntimeSession['metadata']['flavor'];
type ModelReasoningEffort = 'low' | 'medium' | 'high' | 'xhigh';
type PermissionState = PermissionRequest['state'];
type SessionStatusValue = RuntimeSession['state']['status'];
type JsonRpcId = string | number | null;

type HappyRuntimeCreateInput = {
  path: string;
  flavor: RuntimeAgent;
  approvalPolicy?: ApprovalPolicy;
  model?: string;
  status?: SessionStatusValue;
  riskScore?: number;
  branch?: string;
};

type HappyRuntimeAppendInput = {
  type: string;
  title?: string;
  text: string;
  meta?: Record<string, unknown>;
};

type GeminiPartialTextState = {
  eventId: string;
  sessionId: string;
  chatId?: string;
  phase?: 'commentary' | 'final';
  turnId?: string;
  itemId?: string;
  threadId?: string;
  text: string;
  createdAt: string;
};

type HappyBackendSession = {
  id: string;
  seq?: number;
  createdAt?: number;
  updatedAt?: number;
  active?: boolean;
  activeAt?: number;
  metadata: unknown;
  metadataVersion?: number;
  agentState?: unknown;
  agentStateVersion?: number;
  dataEncryptionKey?: string | null;
};

type HappyBackendMessage = {
  id: string;
  seq: number;
  localId: string | null;
  content: unknown;
  createdAt: number;
  updatedAt: number;
  type?: string;
  title?: string;
};

type HappyListSessionsResponse = {
  sessions: unknown[];
};

type HappySessionResponse = {
  session?: HappyBackendSession;
  sessions?: HappyBackendSession[];
};

type HappyMessageResponse = {
  messages: HappyBackendMessage[];
  hasMore?: boolean;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function parseJson(value: string): unknown | null {
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

function decodeBase64ToUtf8(value: string): string | null {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9+/=\n\r]+$/.test(trimmed)) {
    return null;
  }

  try {
    const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
    return decoded.length > 0 ? decoded : null;
  } catch {
    return null;
  }
}

function toIso(value: unknown): string {
  const candidate = typeof value === 'number' && Number.isFinite(value)
    ? value
    : Number.parseInt(String(value), 10);

  if (Number.isFinite(candidate) && candidate > 0) {
    return new Date(candidate).toISOString();
  }

  return new Date().toISOString();
}

function normalizeAgent(value: unknown): RuntimeAgent {
  return value === 'claude' || value === 'codex' || value === 'gemini' ? value : 'unknown';
}

function normalizePath(value: unknown): string {
  return typeof value === 'string' && value.trim().length > 0 ? value : 'unknown-project';
}

function normalizeModel(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const canonical = trimmed === 'gpt-5-codex' ? 'gpt-5.3-codex' : trimmed;
  return canonical.slice(0, 120);
}

function normalizeModelReasoningEffort(value: unknown): ModelReasoningEffort | undefined {
  if (value === 'low' || value === 'medium' || value === 'high' || value === 'xhigh') {
    return value;
  }
  return undefined;
}

function normalizeGeminiMode(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  return trimmed.slice(0, 120);
}

function buildProviderRuntimeSession<TFlavor extends ProviderRuntimeFlavor>(
  session: RuntimeSession,
  flavor: TFlavor,
): ProviderRuntimeSession<TFlavor> {
  return {
    id: session.id,
    metadata: {
      flavor,
      path: session.metadata.path,
      approvalPolicy: session.metadata.approvalPolicy,
      ...(session.metadata.model ? { model: session.metadata.model } : {}),
      ...(session.metadata.branch ? { branch: session.metadata.branch } : {}),
    },
  };
}

function normalizeStatus(raw: unknown, active: unknown): SessionStatusValue {
  const value = asRecord(raw) ? String((raw as { status?: unknown }).status ?? raw) : raw;
  if (value === 'running' || value === 'idle' || value === 'stopped' || value === 'error') {
    return value;
  }

  if (active === true) {
    return 'running';
  }
  if (active === false) {
    return 'idle';
  }
  return 'unknown';
}

function normalizeApprovalPolicy(value: unknown, fallback: ApprovalPolicy = 'on-request'): ApprovalPolicy {
  const normalized = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (
    normalized === 'on-request'
    || normalized === 'on-failure'
    || normalized === 'never'
    || normalized === 'yolo'
  ) {
    return normalized;
  }
  return fallback;
}

function normalizeMetadata(raw: unknown): {
  flavor: RuntimeAgent;
  path: string;
  approvalPolicy: ApprovalPolicy;
  model?: string;
  branch?: string;
  status?: string;
} {
  if (!raw) {
    return { flavor: 'unknown', path: 'unknown-project', approvalPolicy: DEFAULT_APPROVAL_POLICY };
  }

  let parsed: unknown = raw;
  if (typeof raw === 'string') {
    const asJson = parseJson(raw);
    if (asJson) {
      parsed = asJson;
    } else {
      const decoded = decodeBase64ToUtf8(raw);
      const decodedJson = decoded ? parseJson(decoded) : null;
      if (decodedJson) {
        parsed = decodedJson;
      }
    }
  }

  const record = asRecord(parsed);
  return {
    flavor: normalizeAgent(record?.flavor ?? record?.agent),
    path: normalizePath(record?.path ?? record?.projectPath),
    approvalPolicy: normalizeApprovalPolicy(record?.approvalPolicy, DEFAULT_APPROVAL_POLICY),
    model: normalizeModel(record?.model ?? record?.modelName),
    branch: asString(record?.branch, ''),
    status: asString(record?.status, ''),
  };
}

function findTextCandidate(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return undefined;
    }
    const parsed = parseJson(trimmed);
    if (typeof parsed === 'string') {
      return parsed;
    }
    if (parsed && typeof parsed === 'object') {
      const nested = parseTextFromRecord(asRecord(parsed));
      if (nested) {
        return nested;
      }
    }

    const decoded = decodeBase64ToUtf8(trimmed);
    if (!decoded) {
      return trimmed;
    }
    const decodedParsed = parseJson(decoded);
    if (typeof decodedParsed === 'string') {
      return decodedParsed;
    }
    if (decodedParsed && typeof decodedParsed === 'object') {
      const nested = parseTextFromRecord(asRecord(decodedParsed));
      if (nested) {
        return nested;
      }
    }
    return decoded;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const candidate = findTextCandidate(item);
      if (candidate) {
        return candidate;
      }
    }
    return undefined;
  }

  return undefined;
}

function parseTextFromRecord(record: Record<string, unknown> | null): string | undefined {
  if (!record) {
    return undefined;
  }

  return (
    asString(record.text, '') ||
    asString(record.body, '') ||
    asString(asRecord(record.message)?.text, '') ||
    asString(asRecord(record.message)?.body, '') ||
    asString(asRecord(record.content)?.text, '') ||
    asString(asRecord(record.content)?.body, '') ||
    asString(asRecord(record.payload)?.text, '') ||
    asString(asRecord(record.payload)?.body, '') ||
    asString(asRecord(record.content)?.content, '') ||
    asString(asRecord(record.content)?.message, '') ||
    asString(asRecord(record.payloadMeta)?.text, '')
  ) || undefined;
}

function normalizeWrappedContent(content: unknown): unknown {
  const record = asRecord(content);
  if (record && typeof record.t === 'string' && typeof record.c === 'string') {
    const parsed = parseJson(record.c);
    if (parsed !== null) {
      return parsed;
    }
    const decoded = decodeBase64ToUtf8(record.c);
    if (decoded) {
      const decodedParsed = parseJson(decoded);
      return decodedParsed ?? decoded;
    }
    return record.c;
  }
  return content;
}

function parseMessagePayloadText(payload: unknown): {
  role?: string;
  title?: string;
  text?: string;
  meta?: Record<string, unknown>;
} {
  const normalized = normalizeWrappedContent(payload);
  const candidates: unknown[] = [normalized];

  const record = asRecord(normalized);
  if (record) {
    if (record.content !== undefined) {
      candidates.push(record.content);
    }
    if (record.payload !== undefined) {
      candidates.push(record.payload);
    }
    if (record.message !== undefined) {
      candidates.push(record.message);
    }
  }

  let role: string | undefined;
  let title: string | undefined;
  let text: string | undefined;
  let meta: Record<string, unknown> | undefined;

  for (const candidate of candidates) {
    const current = asRecord(candidate);
    if (!current) {
      const fallbackText = findTextCandidate(candidate);
      if (!text && fallbackText) {
        text = fallbackText;
      }
      continue;
    }

    if (!role && typeof current.role === 'string') {
      role = current.role;
    }
    if (!title && typeof current.title === 'string') {
      title = current.title;
    }
    if (!meta) {
      const currentMeta = asRecord(current.meta) ?? asRecord(current.payloadMeta) ?? asRecord(current.data);
      if (currentMeta) {
        meta = currentMeta;
      }
    }
    if (!text) {
      text = parseTextFromRecord(current);
    }
  }

  if (!text) {
    const debugPayload = stringifyPayloadForDebug(normalized);
    if (debugPayload) {
      text = `${UNPARSED_HAPPY_PAYLOAD_PREFIX}\n${debugPayload}`;
    }
  }

  return {
    role,
    title,
    text,
    meta,
  };
}

function stringifyPayloadForDebug(payload: unknown): string | undefined {
  if (payload === null || payload === undefined) {
    return undefined;
  }
  if (typeof payload === 'string') {
    const trimmed = payload.trim();
    return trimmed || undefined;
  }

  try {
    const serialized = JSON.stringify(payload);
    if (!serialized || serialized === '{}') {
      return undefined;
    }
    return serialized.slice(0, AGENT_MAX_OUTPUT_CHARS);
  } catch {
    const fallback = String(payload).trim();
    return fallback ? fallback.slice(0, AGENT_MAX_OUTPUT_CHARS) : undefined;
  }
}

function toRuntimeMessage(sessionId: string, raw: HappyBackendMessage): RuntimeMessage {
  const parsed = parseMessagePayloadText(raw.content);
  const role = parsed.role === 'agent' || parsed.role === 'user' ? parsed.role : undefined;

  return {
    id: raw.id,
    sessionId,
    type: raw.type || 'message',
    title: parsed.title ?? (role === 'user' ? 'User Instruction' : 'Text Reply'),
    text: parsed.text ?? '',
    createdAt: toIso(raw.createdAt),
    meta: parsed.meta || role || Number.isFinite(raw.seq)
      ? { ...(parsed.meta ?? {}), ...(role ? { role } : {}), ...(Number.isFinite(raw.seq) ? { seq: raw.seq } : {}) }
      : undefined,
  };
}

function toRuntimeSession(raw: HappyBackendSession): RuntimeSession {
  const metadata = normalizeMetadata(raw.metadata);
  const seq = Number.isFinite(raw.seq) ? Number(raw.seq) : undefined;
  return {
    id: raw.id,
    ...(seq !== undefined ? { seq } : {}),
    metadata: {
      flavor: metadata.flavor,
      path: metadata.path,
      approvalPolicy: metadata.approvalPolicy,
      ...(metadata.model ? { model: metadata.model } : {}),
      ...(metadata.branch ? { branch: metadata.branch } : {}),
    },
    state: {
      status: normalizeStatus(metadata.status || asRecord(raw.metadata)?.status, raw.active),
    },
    updatedAt: toIso(raw.updatedAt ?? raw.activeAt ?? raw.createdAt),
    riskScore: 20,
  };
}

function buildEchoMessage(sessionId: string, input: HappyRuntimeAppendInput, messageId: string): RuntimeMessage {
  return {
    id: messageId,
    sessionId,
    type: input.type || 'message',
    title: input.title ?? (input.meta?.role === 'agent' ? 'Text Reply' : 'User Instruction'),
    text: input.text,
    createdAt: new Date().toISOString(),
    meta: {
      ...(input.meta ?? {}),
      role: input.meta?.role === 'agent' ? 'agent' : 'user',
    },
  };
}

function trimOutput(value: string): string {
  const normalized = value.trim();
  if (normalized.length <= AGENT_MAX_OUTPUT_CHARS) {
    return normalized;
  }
  return normalized.slice(0, AGENT_MAX_OUTPUT_CHARS);
}

async function waitForStableActivity(input: {
  getActivityTick: () => number;
  getLastActivityAt: () => number;
  quietMs: number;
  timeoutMs: number;
}): Promise<void> {
  const deadline = Date.now() + Math.max(0, input.timeoutMs);
  let observedTick = input.getActivityTick();

  while (Date.now() < deadline) {
    const idleFor = Date.now() - input.getLastActivityAt();
    if (idleFor >= input.quietMs) {
      const currentTick = input.getActivityTick();
      if (currentTick === observedTick) {
        return;
      }
      observedTick = currentTick;
      continue;
    }

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      return;
    }

    const waitMs = Math.min(
      Math.max(10, input.quietMs - Math.max(0, idleFor)),
      remaining,
    );
    await new Promise<void>((resolve) => {
      setTimeout(resolve, waitMs);
    });
    observedTick = input.getActivityTick();
  }
}

type AgentCommand = ProviderCommand;

type ParsedAgentActionEvent = ClaudeActionEvent;

type RunLifecycleStatus = 'run_started' | 'waiting_for_approval' | 'completed' | 'failed' | 'aborted';

function buildRunLifecycleMeta(input: {
  status: RunLifecycleStatus;
  turnId?: string;
  command?: string;
  reason?: string;
}): Record<string, unknown> {
  const eventType = input.status === 'run_started'
    ? 'start'
    : input.status === 'waiting_for_approval'
      ? 'service'
      : 'stop';

  return {
    sessionRole: 'agent',
    sessionEventType: eventType,
    ...(input.turnId ? { sessionTurnId: input.turnId } : {}),
    sessionTurnStatus: input.status,
    runStatus: input.status,
    ...(input.command ? { command: input.command } : {}),
    ...(input.reason ? { reason: input.reason } : {}),
    sessionEvent: {
      role: 'agent',
      ev: {
        t: eventType,
        status: input.status,
        ...(input.command ? { command: input.command } : {}),
        ...(input.reason ? { reason: input.reason } : {}),
      },
    },
  };
}
function shouldSkipDuplicateAgentMessage(
  seenKeys: Set<string>,
  turnId: string | undefined,
  text: string,
): boolean {
  const normalizedText = text.trim();
  if (!normalizedText) {
    return false;
  }

  const normalizedTurnId = typeof turnId === 'string' ? turnId.trim() : '';
  const dedupeKey = normalizedTurnId
    ? `${normalizedTurnId}:${normalizedText}`
    : normalizedText;
  if (seenKeys.has(dedupeKey)) {
    return true;
  }
  seenKeys.add(dedupeKey);
  return false;
}

function shellEscapeSingle(value: string): string {
  return `'${value.replace(/'/g, `'\"'\"'`)}'`;
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

function resolveAgentCommandTimeoutMs(agent: RuntimeAgent): number {
  if (agent === 'claude') {
    return CLAUDE_TURN_TIMEOUT_MS;
  }
  if (agent === 'gemini') {
    return GEMINI_TURN_TIMEOUT_MS;
  }
  return AGENT_COMMAND_TIMEOUT_MS;
}

function collectNestedRecords(root: Record<string, unknown>): Record<string, unknown>[] {
  const stack: unknown[] = [root];
  const records: Record<string, unknown>[] = [];
  while (stack.length > 0) {
    const current = stack.pop();
    const record = asRecord(current);
    if (!record) {
      continue;
    }
    records.push(record);
    for (const value of Object.values(record)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          stack.push(item);
        }
      } else if (value && typeof value === 'object') {
        stack.push(value);
      }
    }
  }
  return records;
}

function extractFirstStringByKeys(records: Record<string, unknown>[], keys: string[]): string {
  for (const key of keys) {
    for (const record of records) {
      const value = record[key];
      if (typeof value !== 'string') {
        continue;
      }
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
    }
  }
  return '';
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
  // Treat non-ASCII text as natural language to avoid dropping localized assistant replies.
  if (/[^\x20-\x7E]/.test(trimmed)) {
    return false;
  }
  return /^(?:\$ )?[a-z0-9._/-]+(?:\s+.+)?$/i.test(trimmed);
}

function looksLikeActionTranscript(value: string): boolean {
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

function buildActionEventKey(action: ParsedAgentActionEvent): string {
  const actionType = action.actionType;
  const callId = action.callId?.trim() ?? '';
  const command = action.command?.trim() ?? '';
  const path = action.path?.trim() ?? '';
  if (callId) {
    return `${actionType}|${callId}`;
  }
  return `${actionType}|${command}|${path}`;
}

function buildStreamedTextReplyKey(input: {
  source: 'assistant' | 'result';
  phase?: 'commentary' | 'final';
  threadId?: string;
  text: string;
}): string {
  return [
    input.source,
    input.phase ?? 'final',
    input.threadId ?? '',
    input.text,
  ].join('|');
}

function extractGeminiStreamTextEvent(parsedLine: {
  assistantText?: string;
  assistantSource?: 'assistant' | 'message' | 'result';
  assistantPhase?: string;
  assistantIsDelta?: boolean;
  assistantTurnId?: string;
  assistantItemId?: string;
  sessionId?: string;
  envelopes?: SessionProtocolEnvelope[];
}): ClaudeTextEvent | null {
  if (!parsedLine.assistantText) {
    return null;
  }

  const textEnvelopes = (parsedLine.envelopes ?? []).filter((envelope) => (
    envelope.kind === 'text' || envelope.kind === 'turn-end'
  ));
  const isPartial = parsedLine.assistantIsDelta === true;
  if (!textEnvelopes.some((envelope) => envelope.kind === 'text') && !isPartial) {
    return null;
  }

  return {
    text: isPartial
      ? parsedLine.assistantText
      : sanitizeAgentMessageText(parsedLine.assistantText),
    source: parsedLine.assistantSource === 'result' ? 'result' : 'assistant',
    ...(parsedLine.sessionId ? { threadId: parsedLine.sessionId } : {}),
    ...(parsedLine.assistantTurnId ? { turnId: parsedLine.assistantTurnId } : {}),
    ...(parsedLine.assistantItemId ? { itemId: parsedLine.assistantItemId } : {}),
    ...(isPartial ? { partial: true } : {}),
    ...(textEnvelopes.length > 0 ? { envelopes: textEnvelopes } : {}),
  };
}

function shouldPersistFinalAgentOutput(input: {
  flavor: RuntimeAgent;
  streamedPersisted: boolean;
  agentMessagePersisted: boolean;
  finalAgentOutput: string;
}): boolean {
  if (input.flavor === 'codex') {
    return !input.streamedPersisted || (!input.agentMessagePersisted && input.finalAgentOutput.length > 0);
  }
  return !input.agentMessagePersisted && input.finalAgentOutput.length > 0;
}

function parseAgentStreamLine(line: string): { action?: ParsedAgentActionEvent; actionKey?: string; assistantText?: string; sessionId?: string } {
  const payload = parseJsonLine(line);
  if (!payload) {
    return {};
  }

  const payloadType = asString(payload.type, '').trim().toLowerCase();
  const payloadSubtype = asString(payload.subtype, '').trim().toLowerCase();
  const lineLower = line.toLowerCase();
  const records = collectNestedRecords(payload);
  const commandRaw = extractFirstStringByKeys(records, [
    'command',
    'cmd',
    'parsed_cmd',
    'shellCommand',
    'shell_command',
  ]);
  const command = commandRaw ? unwrapShellCommand(commandRaw) : '';
  const path = extractFirstStringByKeys(records, [
    'path',
    'filePath',
    'file_path',
    'targetPath',
    'target_path',
    'name',
  ]);
  const outputCandidate = extractFirstStringByKeys(records, [
    'aggregatedOutput',
    'aggregated_output',
    'output',
    'stdout',
    'result',
    'text',
  ]);
  const diffStats = summarizeDiffText(outputCandidate);
  const normalizedPath = path && (path.includes('/') || path.includes('.') || path.startsWith('~')) ? path : '';
  const callId = extractFirstStringByKeys(records, [
    'callId',
    'call_id',
    'toolCallId',
    'tool_call_id',
    'call',
  ]);
  const sessionId = extractFirstStringByKeys(records, [
    'session_id',
    'sessionId',
    'sessionid',
    'resume_session_id',
    'resumeSessionId',
  ]);

  let action: ParsedAgentActionEvent | undefined;
  let actionType: ParsedAgentActionEvent['actionType'] | null = null;
  if (command && looksLikeShellCommand(command)) {
    actionType = inferActionTypeFromCommand(command);
  } else if (normalizedPath && /(write|patch|modify|edit|create|delete|update|changed)/i.test(lineLower)) {
    actionType = 'file_write';
  } else if (normalizedPath && /(read|open|inspect|view|cat|grep|sed -n)/i.test(lineLower)) {
    actionType = 'file_read';
  } else if (/(directory listing|file list|\bls\b|\btree\b|rg --files)/i.test(lineLower)) {
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

  const isSystem = payloadType === 'system' || payloadSubtype === 'init';
  const seemsToolEvent = (
    lineLower.includes('commandexecution')
    || lineLower.includes('exec_command')
    || lineLower.includes('tool')
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
  const assistantText = (!isSystem && !seemsToolEvent && seemsAssistantEvent)
    ? extractFirstStringByKeys(records, ['text', 'message', 'content', 'output'])
    : '';

  return {
    ...(action ? { action, actionKey: buildActionEventKey(action) } : {}),
    ...(assistantText ? { assistantText } : {}),
    ...(sessionId ? { sessionId } : {}),
  };
}

function parseAgentStreamOutput(stdout: string): { output: string; actions: ParsedAgentActionEvent[]; sessionId?: string } {
  const lines = stdout
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const actionByKey = new Map<string, ParsedAgentActionEvent>();
  let latestAssistantText = '';
  let latestSessionId = '';

  for (const line of lines) {
    const parsedLine = parseAgentStreamLine(line);
    if (parsedLine.action && parsedLine.actionKey && !actionByKey.has(parsedLine.actionKey)) {
      actionByKey.set(parsedLine.actionKey, parsedLine.action);
    }
    const assistantText = parsedLine.assistantText
      ? sanitizeAgentMessageText(parsedLine.assistantText)
      : '';
    if (
      assistantText
      && !looksLikeShellCommand(assistantText)
      && !looksLikeActionTranscript(assistantText)
      && assistantText.length >= latestAssistantText.length
    ) {
      latestAssistantText = assistantText;
    }
    if (parsedLine.sessionId) {
      latestSessionId = parsedLine.sessionId;
    }
  }

  return {
    output: latestAssistantText,
    actions: [...actionByKey.values()],
    ...(latestSessionId ? { sessionId: latestSessionId } : {}),
  };
}

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line);
    return asRecord(parsed);
  } catch {
    return null;
  }
}

function toJsonRpcIdKey(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value);
  }
  if (value === null) {
    return 'null';
  }
  return JSON.stringify(value);
}

function isAbortFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as { name?: string; code?: string; message?: string };
  if (candidate.name === 'AbortError' || candidate.code === 'ABORT_ERR') {
    return true;
  }

  return typeof candidate.message === 'string' && candidate.message.toLowerCase().includes('aborted');
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

function resolveClaudeLaunchMode(input: {
  sessionPath?: string;
  workspaceRoot: string;
  hostProjectsRoot: string;
}): ClaudeSessionLaunchMode {
  const raw = typeof input.sessionPath === 'string' ? input.sessionPath.trim() : '';
  if (!raw || !input.hostProjectsRoot) {
    return 'local';
  }

  const normalizedWorkspaceRoot = input.workspaceRoot.replace(/\/+$/, '');
  const workspacePrefix = `${normalizedWorkspaceRoot}/`;
  return raw === normalizedWorkspaceRoot || raw.startsWith(workspacePrefix)
    ? 'remote'
    : 'local';
}

function isRetryableHappyMessageWriteError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('TransactionWriteConflict')
    || message.includes('deadlock detected')
    || message.includes('could not serialize access')
    || message.includes('serialization failure');
}

function waitForHappyMessageWriteRetry(attempt: number): Promise<void> {
  const delayMs = HAPPY_MESSAGE_WRITE_BASE_DELAY_MS * (2 ** (attempt - 1));
  return new Promise((resolve) => setTimeout(resolve, delayMs));
}

function buildAgentCommand(
  agent: RuntimeAgent,
  prompt: string,
  approvalPolicy: ApprovalPolicy,
  model?: string,
  resumeTarget?: ClaudeResumeTarget | string,
): AgentCommand | null {
  return buildProviderCommand({
    agent,
    prompt,
    approvalPolicy,
    model: normalizeModel(model),
    resumeTarget,
  });
}


export const runtimeCoreTestHooks = {
  parseAgentStreamLine,
  parseAgentStreamOutput,
  looksLikeActionTranscript,
  buildStreamedTextReplyKey,
  extractGeminiStreamTextEvent,
  parseMessagePayloadText,
  buildSessionHintMeta,
  shouldPersistFinalAgentOutput,
  shouldSkipDuplicateAgentMessage,
  buildClaudeSessionId,
  buildAgentCommand,
  buildCodexAppServerListenUrl,
  buildCodexAppServerSpawnOptions,
  classifyCodexAppServerFailure,
  terminateCodexAppServerProcess,
  rejectCodexAppServerPendingRequests,
  createCodexAppServerAbortPromise,
  waitForStableActivity,
  resolveClaudeLaunchMode,
  resolveAgentCommandTimeoutMs,
  resolveGeminiStreamBackendV2Enabled,
  finalizeCodexRuntimePermissions: (
    store: RuntimeCore,
    permissionIds: Iterable<string>,
    options?: { preservePending?: boolean },
  ) => (store as unknown as { permissionRouter: PermissionRouter }).permissionRouter
    .finalizeCodexPermissions(permissionIds, options),
};

export class RuntimeCore {
  private readonly claudeSessionRegistry = new ClaudeSessionRegistry();
  private readonly geminiSessionRegistry = new GeminiSessionRegistry();
  private readonly claudeSessionScanners = new Map<string, ClaudeSessionLogTracker>();
  private readonly codexThreads = new Map<string, string>();

  private get codexHost(): CodexRuntimeHost {
    return {
      runtimeEventLogger: this.runtimeEventLogger,
      permissionRouter: this.permissionRouter,
      activeRunRegistry: this.activeRunRegistry,
      coordinationStore: this.coordinationStore,
      codexThreads: this.codexThreads,
      appendAgentMessage: this.appendAgentMessage.bind(this),
      listMessages: this.listMessages.bind(this),
      createPermission: this.createPermission.bind(this),
      decidePermission: this.decidePermission.bind(this),
      resolveExecutionCwd: this.resolveExecutionCwd.bind(this),
      resolveSessionApprovalPolicy: this.resolveSessionApprovalPolicy.bind(this),
    };
  }
  private readonly geminiPartialTextStates = new Map<string, GeminiPartialTextState>();
  private readonly coordinationStore: RuntimeCoordinationStore | null;
  private readonly permissionRouter: PermissionRouter;
  private readonly realtimeEventBus: RealtimeEventBus;

  private readonly serverUrl: string;
  private readonly serverToken: string;
  private readonly workspaceRoot: string;
  private readonly hostProjectsRoot: string;
  private readonly runtimeEventLogger: RuntimeEventLogger;
  private readonly activeRunRegistry: ActiveRunRegistry;

  // listSessions() 응답을 1초간 캐시하여 getSession() 호출 시 happy-server 왕복을 줄임
  private sessionListCache: { sessions: RuntimeSession[]; expiresAt: number } | null = null;
  private readonly SESSION_LIST_CACHE_TTL_MS = 1_000;

  constructor(opts: {
    serverUrl: string;
    token: string;
    workspaceRoot?: string;
    hostProjectsRoot?: string;
    coordinationStore?: RuntimeCoordinationStore | null;
  }) {
    this.serverUrl = opts.serverUrl.replace(/\/+$/, '');
    this.serverToken = opts.token;
    this.workspaceRoot = (opts.workspaceRoot || '/workspace').replace(/\/+$/, '');
    this.hostProjectsRoot = (opts.hostProjectsRoot || '').replace(/\/+$/, '');
    this.coordinationStore = opts.coordinationStore ?? null;
    this.runtimeEventLogger = new RuntimeEventLogger(HAPPY_EVENT_LOG_DIR, HAPPY_EVENT_LOG_MAX_BYTES);
    this.permissionRouter = new PermissionRouter({
      coordinationStore: this.coordinationStore,
      getSession: (sessionId) => this.getSession(sessionId),
      resolveApprovalPolicy: (session) => this.resolveSessionApprovalPolicy(session),
      abortSessionRuns: (sessionId, chatId) => this.abortSessionRuns(sessionId, chatId),
      appendAgentMessage: (sessionId, text, meta, options) =>
        this.appendAgentMessage(sessionId, text, meta, options),
      appendRunLifecycleEvent: (sessionId, state, meta) =>
        this.appendRunLifecycleEvent(sessionId, state, meta),
    });
    this.realtimeEventBus = new RealtimeEventBus({
      getSession: (sessionId) => this.getSession(sessionId),
    });
    this.activeRunRegistry = new ActiveRunRegistry({
      claudeSessionRegistry: this.claudeSessionRegistry,
      staleTimeoutMs: STALE_RUN_TIMEOUT_MS,
      handleStaleRunCleanup: (input) => this.handleStaleRunCleanup(input),
    });
  }

  beginShutdownDrain(): void {
    this.activeRunRegistry.beginShutdownDrain();
  }

  async awaitDrain(timeoutMs: number): Promise<void> {
    return this.activeRunRegistry.awaitDrain(timeoutMs);
  }

  private resolveSessionApprovalPolicy(session: RuntimeSession): ApprovalPolicy {
    return normalizeApprovalPolicy(session.metadata.approvalPolicy, DEFAULT_APPROVAL_POLICY);
  }

  private clearCodexThreadsForSession(sessionId: string): void {
    for (const key of this.codexThreads.keys()) {
      if (key === sessionId || key.startsWith(`${sessionId}:`)) {
        this.codexThreads.delete(key);
      }
    }
  }

  private buildGeminiPartialIdentity(input: {
    sessionId: string;
    chatId?: string;
    phase?: 'commentary' | 'final';
    turnId?: string;
    itemId?: string;
    threadId?: string;
  }): string | null {
    const scope = input.chatId?.trim() || '__default__';
    const phase = input.phase ?? 'final';
    const turn = input.turnId?.trim() || input.threadId?.trim() || '';
    const item = input.itemId?.trim() || '';
    if (!turn && !item) {
      return null;
    }
    return [
      input.sessionId,
      scope,
      phase,
      turn || '__turn__',
      item || '__item__',
    ].join(':');
  }

  private appendGeminiRealtimePartial(input: {
    session: RuntimeSession;
    chatId?: string;
    model?: string;
    event: ClaudeTextEvent;
  }): void {
    const identity = this.buildGeminiPartialIdentity({
      sessionId: input.session.id,
      chatId: input.chatId,
      phase: input.event.phase,
      turnId: input.event.turnId,
      itemId: input.event.itemId,
      threadId: input.event.threadId,
    });
    if (!identity) {
      return;
    }

    const existing = this.geminiPartialTextStates.get(identity);
    const nextState: GeminiPartialTextState = existing
      ? {
        ...existing,
        threadId: input.event.threadId ?? existing.threadId,
        text: `${existing.text}${input.event.text}`,
      }
      : {
        eventId: `gemini-partial:${identity}`,
        sessionId: input.session.id,
        ...(input.chatId ? { chatId: input.chatId } : {}),
        ...(input.event.phase ? { phase: input.event.phase } : {}),
        ...(input.event.turnId ? { turnId: input.event.turnId } : {}),
        ...(input.event.itemId ? { itemId: input.event.itemId } : {}),
        ...(input.event.threadId ? { threadId: input.event.threadId } : {}),
        text: input.event.text,
        createdAt: new Date().toISOString(),
      };
    this.geminiPartialTextStates.set(identity, nextState);

    const isCommentary = nextState.phase === 'commentary';

    this.realtimeEventBus.append(input.session.id, {
      id: nextState.eventId,
      sessionId: input.session.id,
      type: isCommentary ? 'tool' : 'message',
      title: isCommentary ? 'Thinking' : 'Text Reply',
      text: nextState.text,
      createdAt: new Date().toISOString(),
      meta: {
        role: 'agent',
        agent: 'gemini',
        streamEvent: isCommentary ? 'agent_commentary_partial' : 'agent_message_partial',
        sessionRole: 'agent',
        sessionEventType: 'text',
        ...(isCommentary ? { isThoughtCard: true, actionType: 'think' } : {}),
        sessionEvent: {
          role: 'agent',
          ev: {
            t: 'text',
            ...(nextState.itemId ? { item: nextState.itemId } : {}),
          },
        },
        requestedPath: input.session.metadata.path,
        ...(input.chatId ? { chatId: input.chatId } : {}),
        ...(input.model ? { model: input.model } : {}),
        ...(nextState.phase ? { messagePhase: nextState.phase } : {}),
        ...(nextState.threadId ? { threadId: nextState.threadId, geminiSessionId: nextState.threadId } : {}),
        ...(nextState.turnId ? { sessionTurnId: nextState.turnId } : {}),
        ...(nextState.itemId ? { sessionItemId: nextState.itemId } : {}),
        partial: true,
      },
    });
  }

  private clearGeminiRealtimePartial(input: {
    sessionId: string;
    chatId?: string;
    phase?: 'commentary' | 'final';
    turnId?: string;
    itemId?: string;
    threadId?: string;
  }): void {
    const identity = this.buildGeminiPartialIdentity(input);
    if (!identity) {
      return;
    }
    this.geminiPartialTextStates.delete(identity);
  }

  private clearGeminiRealtimePartialsForScope(input: {
    sessionId: string;
    chatId?: string;
  }): void {
    const chatScope = input.chatId?.trim() || '__default__';
    for (const [identity, state] of this.geminiPartialTextStates.entries()) {
      const stateChatScope = state.chatId?.trim() || '__default__';
      if (state.sessionId !== input.sessionId || stateChatScope !== chatScope) {
        continue;
      }
      this.geminiPartialTextStates.delete(identity);
    }
  }

  private monitorExternalAbortSignal(input: {
    sessionId: string;
    chatId?: string;
    startedAt: number;
    controller: AbortController;
  }): () => void {
    if (!this.coordinationStore) {
      return () => {};
    }

    let disposed = false;
    const startedAt = new Date(input.startedAt);
    const tick = async () => {
      if (disposed || input.controller.signal.aborted) {
        return;
      }
      try {
        const abortRequested = await this.coordinationStore!.hasRequestedAction({
          sessionId: input.sessionId,
          action: 'abort',
          ...(input.chatId ? { chatId: input.chatId } : {}),
          createdAfter: startedAt,
        });
        if (abortRequested && !input.controller.signal.aborted) {
          input.controller.abort();
          return;
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`failed to poll external abort signal: ${message}`);
      }
      if (!disposed && !input.controller.signal.aborted) {
        const timer = setTimeout(() => {
          void tick();
        }, 500);
        timer.unref?.();
      }
    };

    void tick();
    return () => {
      disposed = true;
    };
  }

  private getClaudeSessionScanner(workingDirectory: string): ClaudeSessionLogTracker {
    const scanner = this.claudeSessionScanners.get(workingDirectory);
    if (scanner) {
      return scanner;
    }
    const created = new ClaudeSessionLogTracker({ workingDirectory });
    this.claudeSessionScanners.set(workingDirectory, created);
    return created;
  }

  private abortSessionRuns(sessionId: string, chatId?: string): void {
    this.activeRunRegistry.abortSessionRuns(sessionId, chatId);
  }

  private async cleanupStaleRuns(reason: string): Promise<void> {
    await this.activeRunRegistry.cleanupStaleRuns(reason);
  }

  private async handleStaleRunCleanup(input: StaleRunCleanupInput): Promise<void> {
    const channel = input.agent === 'codex' && CODEX_RUNTIME_MODE !== 'exec' ? 'app_server' : 'exec_cli';
    this.runtimeEventLogger.logParsed({
      sessionId: input.sessionId,
      agent: input.agent,
      ...(input.chatId ? { chatId: input.chatId } : {}),
      ...(input.model ? { model: input.model } : {}),
      turnStatus: 'run_stale_cleanup',
      channel,
      stage: 'run_status',
      payload: {
        reason: input.reason,
        runKey: input.runKey,
        ageMs: input.ageMs,
        staleTimeoutMs: STALE_RUN_TIMEOUT_MS,
        agent: input.agent,
      },
    });
    try {
      await this.appendAgentMessage(
        input.sessionId,
        `장기 실행 감지로 런타임을 정리했습니다. (${Math.floor(input.ageMs / 1000)}초 경과)`,
        {
          ...(input.chatId ? { chatId: input.chatId } : {}),
          ...(input.model ? { model: input.model } : {}),
          runKey: input.runKey,
          streamEvent: 'runtime_stale_cleanup',
          staleTimeoutMs: STALE_RUN_TIMEOUT_MS,
          reason: input.reason,
          error: true,
        },
        { type: 'tool', title: 'Runtime Guard' },
      );
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      console.error(`failed to persist stale run cleanup message: ${detail}`);
    }
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.serverToken) {
      throw new Error('HAPPY_SERVER_TOKEN is required to connect to happy runtime');
    }

    const response = await fetch(`${this.serverUrl}${path}`, {
      ...init,
      headers: {
        'X-Aris-Happy-Bridge': '1',
        Authorization: `Bearer ${this.serverToken}`,
        'Content-Type': 'application/json',
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      const body = (await response.text().catch(() => '')).trim();
      throw new Error(`happy runtime error (${response.status}): ${body || response.statusText}`);
    }

    if (response.status === 204) {
      return {} as T;
    }

    return response.json() as Promise<T>;
  }

  mapHappyResponse(response: HappySessionResponse): HappyBackendSession[] {
    if (Array.isArray(response.sessions)) {
      return response.sessions as HappyBackendSession[];
    }
    if (response.session) {
      return [response.session];
    }
    return [];
  }

  resolveExecutionCwd(cwdHint?: string, branch?: string): string {
    const raw = typeof cwdHint === 'string' ? cwdHint.trim() : '';
    if (!raw) {
      throw new Error('Session project path is empty. Create the session again with a valid path.');
    }

    const candidates = new Set<string>();
    candidates.add(raw);
    if (!path.isAbsolute(raw)) {
      candidates.add(path.resolve(process.cwd(), raw));
    }

    const workspacePrefix = `${this.workspaceRoot}/`;
    if (this.hostProjectsRoot && (raw === this.workspaceRoot || raw.startsWith(workspacePrefix))) {
      const relative = raw === this.workspaceRoot ? '' : raw.slice(workspacePrefix.length);
      candidates.add(relative ? path.resolve(this.hostProjectsRoot, relative) : this.hostProjectsRoot);
    }

    for (const candidate of candidates) {
      if (candidate && existsSync(candidate)) {
        if (branch) {
          const worktreePath = computeWorktreePath(candidate, branch);
          if (existsSync(worktreePath)) {
            return worktreePath;
          }
          throw new Error(`Session worktree path not found on backend host: ${worktreePath}`);
        }
        return candidate;
      }
    }

    throw new Error(`Session project path not found on backend host: ${raw}`);
  }

  private async runAgentCommand(
    agent: RuntimeAgent,
    command: AgentCommand | ClaudeLaunchCommand,
    cwdHint?: string,
    branch?: string,
    signal?: AbortSignal,
    handlers?: {
      onAction?: (action: ParsedAgentActionEvent) => Promise<void>;
      onPermission?: (request: ProviderPermissionRequest) => Promise<PermissionDecision>;
      onText?: (event: ClaudeTextEvent) => Promise<void>;
    },
  ): Promise<{
    output: string;
    cwd: string;
    inferredActions: ParsedAgentActionEvent[];
    streamedActionsPersisted: boolean;
    threadId?: string;
    protocolEnvelopes?: SessionProtocolEnvelope[];
  }> {
    const safeCwd = this.resolveExecutionCwd(cwdHint, branch);
    const mergedPath = `${process.env.PATH || ''}:${AGENT_EXTRA_PATHS}`;
    const { CLAUDECODE: _cc, ...spawnEnv } = process.env;
    const timeoutMs = resolveAgentCommandTimeoutMs(agent);
    const runCommand = async (args: string[]): Promise<{ stdout: string; stderr: string }> => (
      command.requiresPty
        ? execFileAsync(
          'script',
          ['-q', '-c', `${shellEscapeSingle(command.command)} ${args.map(shellEscapeSingle).join(' ')}`, '/dev/null'],
          {
            cwd: safeCwd,
            timeout: timeoutMs,
            maxBuffer: 8 * 1024 * 1024,
            env: { ...spawnEnv, PATH: mergedPath },
            signal,
          },
        )
        : execFileAsync(command.command, args, {
          cwd: safeCwd,
          timeout: timeoutMs,
          maxBuffer: 8 * 1024 * 1024,
          env: { ...spawnEnv, PATH: mergedPath },
          signal,
          stdio: ['ignore', 'pipe', 'pipe'],
          encoding: 'utf8',
        } as any) as unknown as Promise<{ stdout: string; stderr: string }>
    );
    const runCommandStreaming = async (
      args: string[],
      onAction?: (action: ParsedAgentActionEvent) => Promise<void>,
      onPermission?: (request: ProviderPermissionRequest) => Promise<PermissionDecision>,
      onText?: (event: ClaudeTextEvent) => Promise<void>,
    ): Promise<{
      stdout: string;
      stderr: string;
      actions: ParsedAgentActionEvent[];
      streamedActionsPersisted: boolean;
      threadId?: string;
    }> => {
      const tracker = new TurnProgressTracker();
      tracker.setModel(agent);
      return new Promise((resolve, reject) => {
      let child: ReturnType<typeof spawn>;
      try {
        child = command.requiresPty
          ? spawn(
            'script',
            ['-q', '-c', `${shellEscapeSingle(command.command)} ${args.map(shellEscapeSingle).join(' ')}`, '/dev/null'],
            {
              cwd: safeCwd,
              env: { ...spawnEnv, PATH: mergedPath },
              signal,
              stdio: ['ignore', 'pipe', 'pipe'],
            },
          )
          : spawn(command.command, args, {
            cwd: safeCwd,
            env: { ...spawnEnv, PATH: mergedPath },
            signal,
            stdio: ['ignore', 'pipe', 'pipe'],
          });
      } catch (error) {
        reject(error);
        return;
      }

      const actionByKey = new Map<string, ParsedAgentActionEvent>();
      const streamedTextKeys = new Set<string>();
      const seenPermissionKeys = new Set<string>();
      let streamedActionsPersisted = false;
      let stdoutBuffer = '';
      let stderrBuffer = '';
      let lineBuffer = '';
      let resolvedSessionId = '';
      let providerErrorDetail = '';
      let emitChain: Promise<void> = Promise.resolve();
      const geminiStreamAdapter = agent === 'gemini' && GEMINI_STREAM_BACKEND_V2
        ? new GeminiStreamAdapter({
          onParseWarning: (rawLine) => {
            process.stderr.write(`[gemini] JSONL parse failed: ${rawLine.slice(0, 200)}\n`);
          },
        })
        : null;
      let settled = false;
      let timedOut = false;
      let timeoutHandle: NodeJS.Timeout | null = null;
      let timeoutSuspensions = 0;

      const clearTimeoutHandle = () => {
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      };

      const armTimeout = () => {
        clearTimeoutHandle();
        if (settled || timeoutSuspensions > 0) {
          return;
        }
        timeoutHandle = setTimeout(() => {
          timeoutHandle = null;
          timedOut = true;
          child.kill('SIGTERM');
        }, timeoutMs);
      };

      const suspendTimeout = () => {
        timeoutSuspensions += 1;
        clearTimeoutHandle();
      };

      const resumeTimeout = () => {
        timeoutSuspensions = Math.max(0, timeoutSuspensions - 1);
        if (timeoutSuspensions === 0) {
          armTimeout();
        }
      };

      armTimeout();

      const settleReject = (error: unknown) => {
        if (settled) {
          return;
        }
        settled = true;
        clearTimeoutHandle();
        reject(error instanceof Error ? error : new Error(String(error)));
      };

      const parseLine = (rawLine: string) => {
        const normalized = stripAnsi(rawLine).trim();
        if (!normalized) {
          return;
        }
        if (agent === 'claude' && onPermission) {
          const permissionRequest = extractClaudePermissionRequest(normalized);
          if (permissionRequest) {
            const permissionKey = permissionRequest.approvalId || permissionRequest.callId;
            if (!seenPermissionKeys.has(permissionKey)) {
              seenPermissionKeys.add(permissionKey);
              emitChain = emitChain.then(async () => {
                suspendTimeout();
                try {
                  await onPermission(permissionRequest);
                } finally {
                  resumeTimeout();
                }
              });
            }
          }
        }
        if (agent === 'claude') {
          const parsedLine = parseClaudeStreamLine(normalized, {
            onParseWarning: (rawLine) => {
              process.stderr.write(`[claude] JSONL parse failed: ${rawLine.slice(0, 200)}\n`);
            },
          });
          if (parsedLine.sessionId) {
            resolvedSessionId = parsedLine.sessionId;
          }
          if (parsedLine.errorText) {
            providerErrorDetail = parsedLine.errorText;
          }
          if (parsedLine.action && parsedLine.actionKey && !actionByKey.has(parsedLine.actionKey)) {
            actionByKey.set(parsedLine.actionKey, parsedLine.action);
            if (onAction) {
              tracker.nextStep();
              const progressMeta = tracker.toMeta();
              const actionWithMeta: ParsedAgentActionEvent = {
                ...parsedLine.action,
                meta: { ...parsedLine.action.meta, ...progressMeta },
              };
              emitChain = emitChain.then(async () => {
                await onAction(actionWithMeta);
                streamedActionsPersisted = true;
              });
            }
          }
          if (onText && parsedLine.assistantText) {
            const assistantText = sanitizeAgentMessageText(parsedLine.assistantText);
            const textKey = buildStreamedTextReplyKey({
              source: parsedLine.assistantSource === 'result' ? 'result' : 'assistant',
              threadId: parsedLine.sessionId,
              text: assistantText,
            });
            if (assistantText && !streamedTextKeys.has(textKey)) {
              streamedTextKeys.add(textKey);
              const textEnvelopes = parsedLine.envelopes.filter((envelope) => (
                envelope.kind === 'text' || envelope.kind === 'turn-end'
              ));
              emitChain = emitChain.then(async () => {
                await onText({
                  text: assistantText,
                  source: parsedLine.assistantSource ?? 'assistant',
                  ...(parsedLine.sessionId ? { threadId: parsedLine.sessionId } : {}),
                  ...(textEnvelopes.length > 0 ? { envelopes: textEnvelopes } : {}),
                });
              });
            }
          }
          return;
        }

        if (agent === 'gemini' && geminiStreamAdapter) {
          const canonicalEvents = geminiStreamAdapter.processLine(normalized);
          for (const event of canonicalEvents) {
            if (event.threadId) {
              resolvedSessionId = event.threadId;
            }
            if (event.type === 'turn_failed' && event.errorText) {
              providerErrorDetail = event.errorText;
            }
            if (event.type === 'tool_completed') {
              const actionKey = buildActionEventKey(event.action);
              if (!actionByKey.has(actionKey)) {
                actionByKey.set(actionKey, event.action);
                if (onAction) {
                  tracker.nextStep();
                  const progressMeta = tracker.toMeta();
                  const actionWithMeta: ParsedAgentActionEvent = {
                    ...event.action,
                    meta: { ...event.action.meta, ...progressMeta },
                  };
                  emitChain = emitChain.then(async () => {
                    await onAction(actionWithMeta);
                    streamedActionsPersisted = true;
                  });
                }
              }
            }
            if (onText) {
              const textEvent = buildGeminiProviderTextEvent(event);
              if (!textEvent) {
                continue;
              }
              if (!textEvent.partial) {
                const textKey = buildStreamedTextReplyKey({
                  source: textEvent.source,
                  threadId: textEvent.threadId,
                  text: textEvent.text,
                });
                if (streamedTextKeys.has(textKey)) {
                  continue;
                }
                streamedTextKeys.add(textKey);
              }
              emitChain = emitChain.then(async () => {
                await onText(textEvent);
              });
            }
          }
          return;
        }

        const parsedLine = agent === 'gemini'
          ? parseGeminiStreamLine(normalized)
          : parseAgentStreamLine(normalized);
        if (parsedLine.sessionId) {
          resolvedSessionId = parsedLine.sessionId;
        }
        if (parsedLine.action && parsedLine.actionKey && !actionByKey.has(parsedLine.actionKey)) {
          actionByKey.set(parsedLine.actionKey, parsedLine.action);
          if (onAction) {
            emitChain = emitChain.then(async () => {
              await onAction(parsedLine.action!);
              streamedActionsPersisted = true;
            });
          }
        }
        if (agent === 'gemini' && onText) {
          const textEvent = extractGeminiStreamTextEvent(parsedLine);
          if (!textEvent) {
            return;
          }
          if (!textEvent.partial) {
            const textKey = buildStreamedTextReplyKey({
              source: textEvent.source,
              threadId: textEvent.threadId,
              text: textEvent.text,
            });
            if (streamedTextKeys.has(textKey)) {
              return;
            }
            streamedTextKeys.add(textKey);
          }
          emitChain = emitChain.then(async () => {
            await onText(textEvent);
          });
        }
      };

      const flushLineBuffer = () => {
        const remainder = lineBuffer.trim();
        if (remainder) {
          parseLine(remainder);
        }
        lineBuffer = '';
      };

      child.stdout?.on('data', (chunk: Buffer | string) => {
        armTimeout();
        const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
        stdoutBuffer += text;
        lineBuffer += text;
        let lineEnd = lineBuffer.indexOf('\n');
        while (lineEnd >= 0) {
          const rawLine = lineBuffer.slice(0, lineEnd).replace(/\r$/, '');
          parseLine(rawLine);
          lineBuffer = lineBuffer.slice(lineEnd + 1);
          lineEnd = lineBuffer.indexOf('\n');
        }
      });

      child.stderr?.on('data', (chunk: Buffer | string) => {
        armTimeout();
        stderrBuffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      });

      child.once('error', (error) => {
        settleReject(error);
      });

      child.once('close', (code, closeSignal) => {
        if (settled) {
          return;
        }
        clearTimeoutHandle();
        flushLineBuffer();
        emitChain
          .then(() => {
            if (signal?.aborted) {
              throw new Error('The operation was aborted');
            }
            if (code !== 0) {
              if (timedOut) {
                const timeoutError = new Error(
                  `${agent} CLI timed out after ${timeoutMs}ms`
                  + (resolvedSessionId ? ` (session ${resolvedSessionId})` : ''),
                );
                if (resolvedSessionId) {
                  Object.assign(timeoutError, { threadId: resolvedSessionId });
                }
                Object.assign(timeoutError, { timedOut: true });
                throw timeoutError;
              }
              const detail = providerErrorDetail || stripAnsi(stderrBuffer || stdoutBuffer || '').slice(0, 800);
              const cliError = new Error(`${agent} CLI failed (${code}${closeSignal ? `/${closeSignal}` : ''}): ${detail || 'Unknown CLI error'}`);
              if (resolvedSessionId) {
                Object.assign(cliError, { threadId: resolvedSessionId });
              }
              throw cliError;
            }
            settled = true;
            resolve({
              stdout: stdoutBuffer,
              stderr: stderrBuffer,
              actions: [...actionByKey.values()],
              streamedActionsPersisted,
              ...(resolvedSessionId ? { threadId: resolvedSessionId } : {}),
            });
          })
          .catch((error) => {
            settleReject(error);
          });
      });
      });
    };

    let result: { stdout: string; stderr: string; threadId?: string } | null = null;
    let lastError: unknown = null;
    let inferredActions: ParsedAgentActionEvent[] = [];
    let streamedActionsPersisted = false;
    if (command.streamJson && (handlers?.onAction || handlers?.onPermission || handlers?.onText)) {
      try {
        const streamed = await runCommandStreaming(command.args, handlers.onAction, handlers.onPermission, handlers.onText);
        result = {
          stdout: streamed.stdout,
          stderr: streamed.stderr,
          ...(streamed.threadId ? { threadId: streamed.threadId } : {}),
        };
        inferredActions = streamed.actions;
        streamedActionsPersisted = streamed.streamedActionsPersisted;
      } catch (error) {
        if (isAbortFailure(error)) {
          throw error;
        }
        lastError = error;
      }
    } else {
      try {
        result = await runCommand(command.args);
      } catch (error) {
        if (isAbortFailure(error)) {
          throw error;
        }
        lastError = error;
      }
    }

    if (!result && command.retryArgsOnFailure && command.retryArgsOnFailure.length > 0) {
      try {
        result = await runCommand(command.retryArgsOnFailure);
      } catch (retryError) {
        if (isAbortFailure(retryError)) {
          throw retryError;
        }
        lastError = retryError;
      }
    }

    if (!result) {
      const asRecord = lastError as { stdout?: string; stderr?: string; message?: string } | null;
      const stdout = stripAnsi(asRecord?.stdout || '');
      const stderr = stripAnsi(asRecord?.stderr || '');
      const detail = stderr || stdout || asRecord?.message || 'Unknown CLI error';
      throw new Error(`${agent} CLI failed: ${detail.slice(0, 800)}`);
    }

    if (agent === 'claude') {
      const hintedSessionIds = extractClaudeSessionHintIds(command.args);
      if (result.threadId) {
        hintedSessionIds.unshift(result.threadId);
      }
      const scanner = this.getClaudeSessionScanner(safeCwd);
      scanner.trackSessionIds(hintedSessionIds, { hinted: true });
      const scannedSession = await scanner.poll();
      if (
        scannedSession.sessionId
        && (
          !result.threadId
          || hintedSessionIds.includes(result.threadId)
        )
      ) {
        result.threadId = scannedSession.sessionId;
      }
    }

    const cleanedStdout = stripAnsi(result.stdout || '');
    const cleanedStderr = stripAnsi(result.stderr || '');
    let output = '';
    let protocolEnvelopes: SessionProtocolEnvelope[] | undefined;
    if (command.streamJson) {
      if (agent === 'claude') {
        const parsed = parseClaudeStreamOutput(cleanedStdout);
        if (inferredActions.length === 0) {
          inferredActions = parsed.actions;
        }
        protocolEnvelopes = parsed.envelopes;
        if (!result.threadId && parsed.sessionId) {
          result.threadId = parsed.sessionId;
        }
        if (parsed.errorText) {
          const providerError = new Error(parsed.errorText);
          const observedThreadId = result.threadId ?? parsed.sessionId;
          if (observedThreadId) {
            Object.assign(providerError, { threadId: observedThreadId });
          }
          throw providerError;
        }
        output = trimOutput(parsed.output || '');
      } else if (agent === 'gemini') {
        const parsed = parseGeminiStreamOutput(cleanedStdout);
        if (inferredActions.length === 0) {
          inferredActions = parsed.actions;
        }
        protocolEnvelopes = parsed.envelopes;
        if (!result.threadId && parsed.sessionId) {
          result.threadId = parsed.sessionId;
        }
        if (parsed.errorText) {
          const providerError = new Error(parsed.errorText);
          const observedThreadId = result.threadId ?? parsed.sessionId;
          if (observedThreadId) {
            Object.assign(providerError, { threadId: observedThreadId });
          }
          throw providerError;
        }
        output = trimOutput(parsed.output || '');
      } else {
        const parsed = parseAgentStreamOutput(cleanedStdout);
        if (inferredActions.length === 0) {
          inferredActions = parsed.actions;
        }
        if (!result.threadId && parsed.sessionId) {
          result.threadId = parsed.sessionId;
        }
        output = trimOutput(parsed.output || '');
      }
      const needsFallback = !output || (
        agent === 'claude'
          ? looksLikeClaudeActionTranscript(output)
          : agent === 'gemini'
            ? looksLikeGeminiActionTranscript(output)
            : looksLikeActionTranscript(output)
      );
      if (needsFallback && command.fallbackArgs && command.fallbackArgs.length > 0) {
        try {
          const fallback = await runCommand(command.fallbackArgs);
          const fallbackStdout = stripAnsi(fallback.stdout || '');
          const fallbackStderr = stripAnsi(fallback.stderr || '');
          const fallbackOutput = trimOutput(fallbackStdout || fallbackStderr || '');
          if (fallbackOutput) {
            output = fallbackOutput;
          }
        } catch (fallbackError) {
          if (isAbortFailure(fallbackError)) {
            throw fallbackError;
          }
        }
      }
      if (!output) {
        const nonJsonStdout = cleanedStdout
          .split('\n')
          .map((line) => line.trim())
          .filter((line) => line && !parseJsonLine(line))
          .join('\n');
        output = trimOutput(nonJsonStdout || cleanedStdout || cleanedStderr || '');
      }
    } else {
      output = trimOutput(cleanedStdout || cleanedStderr || '');
    }
    if (!output) {
      throw new Error(`${agent} returned an empty response`);
    }
    return {
      output,
      cwd: safeCwd,
      inferredActions,
      streamedActionsPersisted,
      ...(result.threadId ? { threadId: result.threadId } : {}),
      ...(protocolEnvelopes ? { protocolEnvelopes } : {}),
    };
  }

  private async runAgentCli(
    agent: RuntimeAgent,
    prompt: string,
    approvalPolicy: ApprovalPolicy,
    model?: string,
    cwdHint?: string,
    branch?: string,
    signal?: AbortSignal,
    resumeTarget?: ClaudeResumeTarget | string,
    handlers?: {
      onAction?: (action: ParsedAgentActionEvent) => Promise<void>;
      onPermission?: (request: ProviderPermissionRequest) => Promise<PermissionDecision>;
      onText?: (event: ClaudeTextEvent) => Promise<void>;
    },
  ): Promise<{
    output: string;
    cwd: string;
    inferredActions: ParsedAgentActionEvent[];
    streamedActionsPersisted: boolean;
    threadId?: string;
    protocolEnvelopes?: SessionProtocolEnvelope[];
  }> {
    const command = buildAgentCommand(agent, prompt, approvalPolicy, model, resumeTarget);
    if (!command) {
      throw new Error(`Unsupported agent flavor: ${agent}`);
    }
    return this.runAgentCommand(agent, command, cwdHint, branch, signal, handlers);
  }

  private async runGeminiAcpTurn(input: {
    session: ProviderRuntimeSession<'gemini'>;
    prompt: string;
    preferredThreadId?: string;
    chatId?: string;
    model?: string;
    mode?: string;
    signal?: AbortSignal;
    onAction?: (action: ProviderActionEvent, meta: { threadId: string }) => Promise<void>;
    onPermission?: (request: ProviderPermissionRequest, meta: { threadId: string }) => Promise<PermissionDecision>;
    onText?: (event: ProviderTextEvent, meta: { threadId: string }) => Promise<void>;
  }) {
    const safeCwd = this.resolveExecutionCwd(input.session.metadata.path, input.session.metadata.branch);
    return runGeminiAcpTurn({
      cwd: safeCwd,
      prompt: input.prompt,
      approvalPolicy: input.session.metadata.approvalPolicy,
      model: normalizeModel(input.model) ?? undefined,
      mode: normalizeGeminiMode(input.mode),
      preferredSessionId: input.preferredThreadId,
      signal: input.signal,
      onAction: input.onAction
        ? ((action, meta) => input.onAction!(action, meta))
        : undefined,
      onPermission: input.onPermission
        ? ((request, meta) => input.onPermission!(request, meta))
        : undefined,
      onText: input.onText
        ? ((event, meta) => input.onText!(event, meta))
        : undefined,
      onRawLine: (line) => {
        this.runtimeEventLogger.logRaw({
          sessionId: input.session.id,
          agent: 'gemini',
          ...(input.chatId ? { chatId: input.chatId } : {}),
          ...(normalizeModel(input.model) ? { model: normalizeModel(input.model)! } : {}),
          channel: 'exec_cli',
          line,
        });
      },
    });
  }

  private async appendAgentMessage(
    sessionId: string,
    text: string,
    meta: Record<string, unknown> = {},
    options: { type?: string; title?: string } = {},
  ): Promise<void> {
    try {
      const textStr = typeof text === 'string' ? text : String(text ?? '');
      const cleanedText = trimOutput(textStr.replace(/\n?0;\s*$/g, '').trim());
      const localId = `aris-agent-${randomUUID()}`;
      const type = options.type ?? 'message';
      const title = options.title ?? (type === 'message' ? 'Text Reply' : 'Command Execution');
      const content = JSON.stringify({
        role: 'agent',
        title,
        text: cleanedText,
        type,
        meta: {
          source: 'cli-agent',
          ...meta,
        },
      });

      for (let attempt = 1; attempt <= HAPPY_MESSAGE_WRITE_MAX_RETRIES; attempt += 1) {
        try {
          await this.request<HappyMessageResponse>(`/v3/sessions/${encodeURIComponent(sessionId)}/messages`, {
            method: 'POST',
            body: JSON.stringify({
              messages: [{ localId, content }],
            }),
          });
          return;
        } catch (error) {
          if (!isRetryableHappyMessageWriteError(error) || attempt === HAPPY_MESSAGE_WRITE_MAX_RETRIES) {
            throw error;
          }
          await waitForHappyMessageWriteRetry(attempt);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`failed to persist agent message (best-effort, continuing): ${message}`);
    }
  }

  private async appendRunLifecycleEvent(
    sessionId: string,
    status: RunLifecycleStatus,
    meta: {
      chatId?: string;
      requestedPath?: string;
      execCwd?: string;
      agent?: RuntimeAgent;
      model?: string;
      threadId?: string;
      turnId?: string;
      command?: string;
      reason?: string;
    } = {},
  ): Promise<void> {
    try {
      await this.appendAgentMessage(
        sessionId,
        `run status: ${status}`,
        {
          ...(meta.chatId ? { chatId: meta.chatId } : {}),
          ...(meta.requestedPath ? { requestedPath: meta.requestedPath } : {}),
          ...(meta.execCwd ? { execCwd: meta.execCwd } : {}),
          ...(meta.agent ? { agent: meta.agent } : {}),
          ...(meta.model ? { model: meta.model } : {}),
          ...(meta.threadId ? { threadId: meta.threadId } : {}),
          streamEvent: 'run_status',
          ...buildRunLifecycleMeta({
            status,
            ...(meta.turnId ? { turnId: meta.turnId } : {}),
            ...(meta.command ? { command: meta.command } : {}),
            ...(meta.reason ? { reason: meta.reason } : {}),
          }),
        },
        { type: 'message', title: 'Run Status' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`failed to persist run lifecycle event (${status}): ${message}`);
    }
  }

  private async resolveClaudeThreadId(sessionId: string, chatId?: string): Promise<string | undefined> {
    try {
      return recoverClaudeThreadIdFromMessages(await this.listMessages(sessionId), chatId);
    } catch {
      // Ignore Claude thread recovery failures and let the launcher start from the synthetic seed.
    }

    return undefined;
  }

  private async generateAndPersistAgentReply(
    session: RuntimeSession,
    prompt: string,
    context: {
      chatId?: string;
      threadId?: string;
      agent?: RuntimeAgent;
      model?: string;
      geminiMode?: string;
      customModel?: string;
      modelReasoningEffort?: ModelReasoningEffort;
    } = {},
  ): Promise<void> {
    const flavor = context.agent && context.agent !== 'unknown'
      ? context.agent
      : session.metadata.flavor;
    if (flavor === 'unknown') {
      return;
    }

    const scopedChatId = typeof context.chatId === 'string' && context.chatId.trim().length > 0
      ? context.chatId.trim()
      : undefined;
    if (flavor === 'gemini') {
      this.clearGeminiRealtimePartialsForScope({
        sessionId: session.id,
        chatId: scopedChatId,
      });
    }
    await this.cleanupStaleRuns('before_new_run');
    const modelSelection = resolveRuntimeModelSelection({
      agent: flavor,
      requestedModel: context.model,
      sessionModel: session.metadata.model,
      customModel: context.customModel,
    });
    const selectedModel = modelSelection.model;
    const selectedGeminiMode = flavor === 'gemini'
      ? normalizeGeminiMode(context.geminiMode)
      : undefined;
    const selectedModelReasoningEffort = flavor === 'codex'
      ? normalizeModelReasoningEffort(context.modelReasoningEffort)
      : undefined;
    if (modelSelection.source !== 'requested') {
      this.runtimeEventLogger.logParsed({
        sessionId: session.id,
        agent: flavor,
        ...(scopedChatId ? { chatId: scopedChatId } : {}),
        model: selectedModel,
        ...(selectedGeminiMode ? { geminiMode: selectedGeminiMode } : {}),
        turnStatus: 'model_normalized',
        channel: flavor === 'codex' && CODEX_RUNTIME_MODE !== 'exec' ? 'app_server' : 'exec_cli',
        stage: 'run_status',
        payload: {
          source: modelSelection.source,
          ...(modelSelection.fallbackReason ? { fallbackReason: modelSelection.fallbackReason } : {}),
          ...(modelSelection.requestedModel ? { requestedModel: modelSelection.requestedModel } : {}),
          ...(modelSelection.customModel ? { customModel: modelSelection.customModel } : {}),
        },
      });
    }
    const isClaudeRun = flavor === 'claude';
    const claudeLaunchMode = isClaudeRun
      ? resolveClaudeLaunchMode({
        sessionPath: session.metadata.path,
        workspaceRoot: this.workspaceRoot,
        hostProjectsRoot: this.hostProjectsRoot,
      })
      : 'local';
    let controller: AbortController;
    let claudeController:
      | Awaited<ReturnType<ClaudeSessionRegistry['start']>>
      | undefined;
    let finalizeRun = () => {};
    if (isClaudeRun) {
      claudeController = await this.claudeSessionRegistry.start({
        sessionId: session.id,
        ...(scopedChatId ? { chatId: scopedChatId } : {}),
        ...(selectedModel ? { model: selectedModel } : {}),
        launchMode: claudeLaunchMode,
      }, 5000);
      const activeClaudeController = claudeController;
      controller = activeClaudeController.abortController;
      finalizeRun = () => {
        this.claudeSessionRegistry.finish(activeClaudeController);
      };
    } else {
      const runKey = buildRunKey(session.id, scopedChatId);
      const activeController = new AbortController();
      const existing = this.activeRunRegistry.get(runKey);
      if (existing && !existing.controller.signal.aborted) {
        existing.controller.abort();
      }
      if (existing) {
        await Promise.race([
          existing.completed,
          new Promise<void>((resolve) => {
            setTimeout(resolve, 5000);
          }),
        ]);
      }
      let finishRun = () => {};
      const completed = new Promise<void>((resolve) => {
        finishRun = resolve;
      });
      this.activeRunRegistry.set(runKey, {
        controller: activeController,
        sessionId: session.id,
        ...(scopedChatId ? { chatId: scopedChatId } : {}),
        startedAt: Date.now(),
        agent: flavor,
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(selectedGeminiMode ? { geminiMode: selectedGeminiMode } : {}),
        ...(selectedModelReasoningEffort ? { modelReasoningEffort: selectedModelReasoningEffort } : {}),
        completed,
      });
      controller = activeController;
      finalizeRun = () => {
        finishRun();
        const current = this.activeRunRegistry.get(runKey);
        if (current?.controller === activeController) {
          this.activeRunRegistry.delete(runKey);
        }
      };
    }

    await this.appendRunLifecycleEvent(session.id, 'run_started', {
      ...(scopedChatId ? { chatId: scopedChatId } : {}),
      requestedPath: session.metadata.path,
      agent: flavor,
      ...(selectedModel ? { model: selectedModel } : {}),
      ...(selectedGeminiMode ? { geminiMode: selectedGeminiMode } : {}),
    });
    const stopExternalAbortWatcher = this.monitorExternalAbortSignal({
      sessionId: session.id,
      ...(scopedChatId ? { chatId: scopedChatId } : {}),
      startedAt: Date.now(),
      controller,
    });

    try {
      const isCodex = flavor === 'codex';
      const isClaude = flavor === 'claude';
      const isGemini = flavor === 'gemini';
      const requestedThreadId = typeof context.threadId === 'string' && context.threadId.trim().length > 0
        ? context.threadId.trim()
        : undefined;
      const storedClaudeThreadId = isClaude
        ? (
          claudeController?.session.resolvePreferredThreadId(
            undefined,
            await this.resolveClaudeThreadId(session.id, scopedChatId),
          )
        )
        : undefined;
      const preferredThreadId = isClaude
        ? requestedThreadId ?? storedClaudeThreadId
        : requestedThreadId;
      const threadCacheKey = buildCodexThreadCacheKey(session.id, scopedChatId);
      let response: {
        output: string;
        cwd: string;
        streamedPersisted?: boolean;
        agentMessagePersisted?: boolean;
        streamedActionsPersisted?: boolean;
        threadId?: string;
        threadIdSource?: 'resume' | 'observed' | 'synthetic';
        messageMeta?: Record<string, unknown>;
        protocolEnvelopes?: SessionProtocolEnvelope[];
        inferredActions?: ParsedAgentActionEvent[];
      };
      const streamedGeminiTextReplies = new Set<string>();
      let streamedGeminiCompletedTextPersisted = false;
      const streamedClaudeTextReplies = new Set<string>();
      let streamedClaudeCompletedTextPersisted = false;
      let claudeMessageQueue: ClaudeMessageQueue | null = null;
      let geminiMessageQueue: GeminiMessageQueue | null = null;
      const persistClaudeProjection = async (projection: {
        body: string;
        meta: Record<string, unknown>;
        options?: { type?: string; title?: string };
      }) => this.appendAgentMessage(session.id, projection.body, projection.meta, projection.options);
      const persistGeminiProjection = async (projection: {
        body: string;
        meta: Record<string, unknown>;
        options?: { type?: string; title?: string };
      }) => this.appendAgentMessage(session.id, projection.body, projection.meta, projection.options);
      const appendNonCodexAction = async (
        action: ParsedAgentActionEvent,
        indexSeed: number,
        cwd: string,
        threadId?: string,
      ) => {
        const sessionCallId = (action.callId || `call-${indexSeed + 1}`).trim();
        const outputPreview = action.output ? trimOutput(action.output) : '';
        const bodyParts = [
          action.command ? `$ ${action.command}` : '',
          action.path ? `path: ${action.path}` : '',
          outputPreview,
        ].filter(Boolean);
        const body = bodyParts.join('\n').trim();
        if (!body) {
          return;
        }

        await this.appendAgentMessage(session.id, body, {
          ...(scopedChatId ? { chatId: scopedChatId } : {}),
          requestedPath: session.metadata.path,
          execCwd: cwd,
          actionType: action.actionType,
          normalizedActionKind: action.actionType,
          command: action.command,
          path: action.path,
          additions: action.additions,
          deletions: action.deletions,
          hasDiffSignal: action.hasDiffSignal,
          ...buildSessionHintMeta({
            eventType: 'tool-call-end',
            callId: sessionCallId,
          }),
          streamEvent: 'agent_stream_action',
          agent: flavor,
          model: selectedModel,
          ...(threadId ? { threadId } : {}),
        }, {
          type: 'tool',
          title: action.title,
        });
      };

      if (isCodex) {
        const recoveredThreadId = preferredThreadId ?? await resolveCodexThreadId(this.codexHost, session.id, scopedChatId);
        try {
          response = await runCodexCli(this.codexHost, 
            session,
            prompt,
            controller.signal,
            recoveredThreadId,
            scopedChatId,
            selectedModel,
            selectedModelReasoningEffort,
          );
        } catch (error) {
          if (!recoveredThreadId || !isMissingCodexThreadError(error)) {
            throw error;
          }

          // Stored thread id became invalid; clear and start a fresh Codex thread.
          this.codexThreads.delete(threadCacheKey);
          response = await runCodexCli(this.codexHost, 
            session,
            prompt,
            controller.signal,
            undefined,
            scopedChatId,
            selectedModel,
            selectedModelReasoningEffort,
          );
        }
      } else {
        const nonCodexCwd = this.resolveExecutionCwd(session.metadata.path, session.metadata.branch);
        claudeMessageQueue = isClaude
          ? new ClaudeMessageQueue(
            {
              ...(scopedChatId ? { chatId: scopedChatId } : {}),
              requestedPath: session.metadata.path,
              ...(selectedModel ? { model: selectedModel } : {}),
              launchMode: claudeLaunchMode,
            },
            persistClaudeProjection,
          )
          : null;
        let streamedActionIndex = 0;
        if (isClaude) {
          const claudeSession = buildProviderRuntimeSession(session, 'claude');
          const claudeResponse = await runClaudeProviderTurn({
            session: claudeSession,
            sessionOwner: claudeController?.session,
            prompt,
            chatId: scopedChatId,
            requestedThreadId,
            storedThreadId: storedClaudeThreadId,
            model: selectedModel,
            signal: controller.signal,
            onAction: async (action, meta) => {
              await claudeMessageQueue?.enqueueToolAction({
                action,
                execCwd: nonCodexCwd,
                threadId: meta.threadId,
              });
              streamedActionIndex += 1;
            },
            onText: async (event, meta) => {
              const normalizedText = sanitizeAgentMessageText(event.text);
              if (!normalizedText) {
                return;
              }
              const eventPhase = event.phase === 'commentary'
                ? 'commentary'
                : event.source === 'result'
                  ? 'final'
                  : 'commentary';
              const textKey = buildStreamedTextReplyKey({
                source: event.source,
                phase: eventPhase,
                threadId: meta.threadId,
                text: normalizedText,
              });
              if (streamedClaudeTextReplies.has(textKey)) {
                return;
              }

              if (event.source === 'result') {
                const assistantTwinKey = buildStreamedTextReplyKey({
                  source: 'assistant',
                  phase: eventPhase,
                  threadId: meta.threadId,
                  text: normalizedText,
                });
                if (streamedClaudeTextReplies.has(assistantTwinKey)) {
                  return;
                }
              }

              streamedClaudeTextReplies.add(textKey);
              if (eventPhase === 'final') {
                streamedClaudeCompletedTextPersisted = true;
              }
              await claudeMessageQueue?.enqueueText({
                output: normalizedText,
                execCwd: nonCodexCwd,
                threadId: meta.threadId,
                messageMeta: {
                  streamEvent: 'agent_message',
                  ...(eventPhase === 'commentary' ? { messagePhase: eventPhase } : {}),
                },
                envelopes: event.envelopes,
              });
            },
            onPermission: async (request) => this.permissionRouter.handleProviderPermissionRequest({
              session,
              chatId: scopedChatId,
              agent: 'claude',
              request,
              signal: controller.signal,
            }),
            executeCommand: async ({ command, cwdHint, signal, onAction, onPermission, onText }) => this.runAgentCommand(
              'claude',
              command,
              cwdHint,
              session.metadata.branch,
              signal,
              {
                onAction,
                onPermission,
                onText,
              },
            ),
          });
          response = {
            output: claudeResponse.output,
            cwd: claudeResponse.cwd,
            streamedPersisted: false,
            agentMessagePersisted: streamedClaudeCompletedTextPersisted,
            streamedActionsPersisted: claudeResponse.streamedActionsPersisted,
            inferredActions: claudeResponse.inferredActions,
            threadId: claudeResponse.threadId ?? claudeResponse.actionThreadId,
            threadIdSource: claudeResponse.threadIdSource,
            messageMeta: claudeResponse.messageMeta,
            protocolEnvelopes: claudeResponse.protocolEnvelopes,
          };
        } else if (isGemini) {
          const geminiSession = buildProviderRuntimeSession(session, 'gemini');
          geminiMessageQueue = new GeminiMessageQueue(
            {
              ...(scopedChatId ? { chatId: scopedChatId } : {}),
              requestedPath: session.metadata.path,
              ...(selectedModel ? { model: selectedModel } : {}),
            },
            persistGeminiProjection,
          );
          const geminiRuntime = createGeminiRuntime({
            registry: this.geminiSessionRegistry,
            listMessages: async (sessionId) => this.listMessages(sessionId),
            executeTurn: async (request) => this.runGeminiAcpTurn(request),
          });
          const recovered = await geminiRuntime.recoverSession({
            session: geminiSession,
            chatId: scopedChatId,
          });
          this.runtimeEventLogger.logParsed({
            sessionId: session.id,
            agent: 'gemini',
            ...(scopedChatId ? { chatId: scopedChatId } : {}),
            model: selectedModel,
            turnStatus: 'run_started',
            channel: 'exec_cli',
            stage: 'run_status',
            payload: {
              mode: 'acp',
              storedThreadId: recovered.recoveredThreadId,
              requestedThreadId,
            },
          });
          this.runtimeEventLogger.logParsed({
            sessionId: session.id,
            agent: 'gemini',
            ...(scopedChatId ? { chatId: scopedChatId } : {}),
            model: selectedModel,
            channel: 'exec_cli',
            stage: 'incoming_payload',
            payload: {
              prompt,
            },
          });
          const geminiResponse = await geminiRuntime.sendTurn({
            session: geminiSession,
            prompt,
            chatId: scopedChatId,
            requestedThreadId,
            storedThreadId: recovered.recoveredThreadId,
            model: selectedModel,
            mode: selectedGeminiMode,
            signal: controller.signal,
            onAction: async (action, meta) => {
              this.realtimeEventBus.append(session.id, {
                id: `gemini-action-pending:${action.callId ?? String(Date.now())}`,
                sessionId: session.id,
                type: 'tool',
                title: action.title,
                text: [action.command, action.path].filter(Boolean).join('\n'),
                createdAt: new Date().toISOString(),
                meta: {
                  agent: 'gemini',
                  chatId: scopedChatId,
                  streamEvent: 'gemini_action_pending',
                  sessionCallId: action.callId ?? '',
                  actionType: action.actionType,
                  command: action.command,
                  path: action.path,
                  threadId: meta.threadId,
                },
              });
              this.runtimeEventLogger.logParsed({
                sessionId: session.id,
                agent: 'gemini',
                ...(scopedChatId ? { chatId: scopedChatId } : {}),
                threadId: meta.threadId,
                model: selectedModel,
                channel: 'exec_cli',
                stage: 'parsed_append',
                payload: {
                  streamEvent: 'gemini_action_pending',
                  callId: action.callId,
                  actionType: action.actionType,
                  title: action.title,
                  command: action.command,
                  path: action.path,
                },
              });
              await geminiMessageQueue?.enqueueToolAction({
                action,
                execCwd: nonCodexCwd,
                threadId: meta.threadId,
              });
              await geminiMessageQueue?.flush();
            },
            onPermission: async (request) => this.permissionRouter.handleProviderPermissionRequest({
              session,
              chatId: scopedChatId,
              agent: 'gemini',
              request,
              signal: controller.signal,
            }),
            onText: async (event, meta) => {
              if (event.partial) {
                return;
              }

              const normalizedText = sanitizeAgentMessageText(event.text);
              if (!normalizedText) {
                return;
              }
              const textKey = buildStreamedTextReplyKey({
                source: event.source,
                phase: event.phase,
                threadId: meta.threadId,
                text: normalizedText,
              });
              if (streamedGeminiTextReplies.has(textKey)) {
                return;
              }
              streamedGeminiTextReplies.add(textKey);
              if (event.phase !== 'commentary') {
                streamedGeminiCompletedTextPersisted = true;
              }
              const isCommentaryText = event.phase === 'commentary';
              this.runtimeEventLogger.logParsed({
                sessionId: session.id,
                agent: 'gemini',
                ...(scopedChatId ? { chatId: scopedChatId } : {}),
                threadId: meta.threadId,
                model: selectedModel,
                channel: 'exec_cli',
                stage: 'parsed_append',
                payload: {
                  streamEvent: isCommentaryText ? 'agent_commentary' : 'agent_message',
                  phase: event.phase,
                  turnId: event.turnId,
                  itemId: event.itemId,
                  textLength: normalizedText.length,
                  text: normalizedText,
                },
              });
              await geminiMessageQueue?.enqueueText({
                output: normalizedText,
                execCwd: nonCodexCwd,
                threadId: meta.threadId,
                messageMeta: {
                  streamEvent: event.phase === 'commentary' ? 'agent_commentary' : 'agent_message',
                  ...(event.phase ? { messagePhase: event.phase } : {}),
                },
                envelopes: event.envelopes,
              });
              await geminiMessageQueue?.flush();
            },
          });
          this.runtimeEventLogger.logParsed({
            sessionId: session.id,
            agent: 'gemini',
            ...(scopedChatId ? { chatId: scopedChatId } : {}),
            ...(geminiResponse.threadId ? { threadId: geminiResponse.threadId } : {}),
            model: selectedModel,
            turnStatus: 'run_completed',
            channel: 'exec_cli',
            stage: 'run_status',
            payload: {
              agentMessagePersisted: geminiResponse.agentMessagePersisted,
              streamedActionsPersisted: geminiResponse.streamedActionsPersisted,
              threadIdSource: geminiResponse.threadIdSource,
            },
          });
          response = {
            output: geminiResponse.output,
            cwd: geminiResponse.cwd,
            streamedPersisted: false,
            agentMessagePersisted: Boolean(geminiResponse.agentMessagePersisted),
            streamedActionsPersisted: geminiResponse.streamedActionsPersisted,
            inferredActions: geminiResponse.inferredActions,
            threadId: geminiResponse.threadId,
            threadIdSource: geminiResponse.threadIdSource,
            protocolEnvelopes: geminiResponse.protocolEnvelopes,
            messageMeta: {
              ...(geminiResponse.threadId ? { geminiSessionId: geminiResponse.threadId } : {}),
            },
          };
        } else {
          const nonClaude = await this.runAgentCli(
            flavor,
            prompt,
            session.metadata.approvalPolicy,
            selectedModel,
            session.metadata.path,
            session.metadata.branch,
            controller.signal,
            preferredThreadId ? { id: preferredThreadId, mode: 'resume' } : undefined,
            {
              onAction: async (action) => {
                await appendNonCodexAction(action, streamedActionIndex, nonCodexCwd, preferredThreadId);
                streamedActionIndex += 1;
              },
            },
          );
          response = {
            output: nonClaude.output,
            cwd: nonClaude.cwd,
            streamedPersisted: false,
            agentMessagePersisted: false,
            streamedActionsPersisted: nonClaude.streamedActionsPersisted,
            inferredActions: nonClaude.inferredActions,
            threadId: nonClaude.threadId ?? preferredThreadId,
          };
        }
      }

      if (isCodex && response.threadId) {
        this.codexThreads.set(threadCacheKey, response.threadId);
      }

      if (
        !isCodex
        && !response.streamedActionsPersisted
        && Array.isArray(response.inferredActions)
        && response.inferredActions.length > 0
      ) {
        for (const [index, action] of response.inferredActions.slice(0, 10).entries()) {
          if (flavor === 'claude') {
            claudeMessageQueue ??= new ClaudeMessageQueue(
              {
                ...(scopedChatId ? { chatId: scopedChatId } : {}),
                requestedPath: session.metadata.path,
                ...(selectedModel ? { model: selectedModel } : {}),
                launchMode: claudeLaunchMode,
              },
              persistClaudeProjection,
            );
            await claudeMessageQueue.enqueueToolAction({
              action,
              execCwd: response.cwd,
              threadId: response.threadId,
              envelopes: response.protocolEnvelopes,
            });
          } else if (flavor === 'gemini') {
            geminiMessageQueue ??= new GeminiMessageQueue(
              {
                ...(scopedChatId ? { chatId: scopedChatId } : {}),
                requestedPath: session.metadata.path,
                ...(selectedModel ? { model: selectedModel } : {}),
              },
              persistGeminiProjection,
            );
            await geminiMessageQueue.enqueueToolAction({
              action,
              execCwd: response.cwd,
              threadId: response.threadId,
              envelopes: response.protocolEnvelopes,
            });
          } else {
            await appendNonCodexAction(action, index, response.cwd, response.threadId);
          }
        }
      }

      const finalAgentOutput = sanitizeAgentMessageText(response.output);
      const streamedPersisted = Boolean(response.streamedPersisted);
      const agentMessagePersisted = Boolean(response.agentMessagePersisted)
        || (
          flavor === 'claude'
          && (
            streamedClaudeCompletedTextPersisted
            || (
              finalAgentOutput.length > 0
              && (
                streamedClaudeTextReplies.has(buildStreamedTextReplyKey({
                  source: 'assistant',
                  phase: 'final',
                  threadId: response.threadId,
                  text: finalAgentOutput,
                }))
                || streamedClaudeTextReplies.has(buildStreamedTextReplyKey({
                  source: 'assistant',
                  phase: 'commentary',
                  threadId: response.threadId,
                  text: finalAgentOutput,
                }))
                || streamedClaudeTextReplies.has(buildStreamedTextReplyKey({
                  source: 'result',
                  phase: 'final',
                  threadId: response.threadId,
                  text: finalAgentOutput,
                }))
              )
            )
          )
        )
        || (
          flavor === 'gemini'
          && (
            streamedGeminiCompletedTextPersisted
            || (
              finalAgentOutput.length > 0
              && (
            streamedGeminiTextReplies.has(buildStreamedTextReplyKey({
              source: 'assistant',
              phase: 'final',
              threadId: response.threadId,
              text: finalAgentOutput,
            }))
            || streamedGeminiTextReplies.has(buildStreamedTextReplyKey({
              source: 'result',
              phase: 'final',
              threadId: response.threadId,
              text: finalAgentOutput,
            }))
              )
            )
          )
        );
      const persistFinalAgentOutput = shouldPersistFinalAgentOutput({
        flavor,
        streamedPersisted,
        agentMessagePersisted,
        finalAgentOutput,
      });
      if (persistFinalAgentOutput) {
        if (flavor === 'claude') {
          claudeMessageQueue ??= new ClaudeMessageQueue(
            {
              ...(scopedChatId ? { chatId: scopedChatId } : {}),
              requestedPath: session.metadata.path,
              ...(selectedModel ? { model: selectedModel } : {}),
              launchMode: claudeLaunchMode,
            },
            persistClaudeProjection,
          );
          await claudeMessageQueue.enqueueText({
            output: finalAgentOutput,
            execCwd: response.cwd,
            ...(response.threadId ? { threadId: response.threadId } : {}),
            messageMeta: {
              streamEvent: 'agent_message',
              ...(response.threadIdSource ? { threadIdSource: response.threadIdSource } : {}),
              ...(response.messageMeta ?? {}),
            },
            envelopes: response.protocolEnvelopes,
          });
          await claudeMessageQueue.flush();
        } else if (flavor === 'gemini') {
          geminiMessageQueue ??= new GeminiMessageQueue(
            {
              ...(scopedChatId ? { chatId: scopedChatId } : {}),
              requestedPath: session.metadata.path,
              ...(selectedModel ? { model: selectedModel } : {}),
            },
            persistGeminiProjection,
          );
          await geminiMessageQueue.enqueueText({
            output: finalAgentOutput,
            execCwd: response.cwd,
            ...(response.threadId ? { threadId: response.threadId } : {}),
            messageMeta: {
              streamEvent: 'agent_message',
              ...(response.threadIdSource ? { threadIdSource: response.threadIdSource } : {}),
              ...(response.messageMeta ?? {}),
            },
            envelopes: response.protocolEnvelopes,
          });
          await geminiMessageQueue.flush();
        } else {
          await this.appendAgentMessage(session.id, finalAgentOutput, {
            ...(scopedChatId ? { chatId: scopedChatId } : {}),
            requestedPath: session.metadata.path,
            execCwd: response.cwd,
            ...buildSessionHintMeta({ eventType: 'text' }),
            streamEvent: 'agent_message',
            agent: flavor,
            model: selectedModel,
            ...(response.threadId ? { threadId: response.threadId } : {}),
            ...(response.messageMeta ?? {}),
          });
        }
      }
      await this.appendRunLifecycleEvent(session.id, 'completed', {
        ...(scopedChatId ? { chatId: scopedChatId } : {}),
        requestedPath: session.metadata.path,
        execCwd: response.cwd,
        agent: flavor,
        ...(selectedModel ? { model: selectedModel } : {}),
        ...(response.threadId ? { threadId: response.threadId } : {}),
      });
    } catch (error) {
      const scopedChatId = typeof context.chatId === 'string' && context.chatId.trim().length > 0
        ? context.chatId.trim()
        : undefined;
      if (flavor === 'codex' && isMissingCodexThreadError(error)) {
        this.codexThreads.delete(buildCodexThreadCacheKey(session.id, scopedChatId));
      }
      if (isAbortFailure(error) || controller.signal.aborted) {
        await this.appendRunLifecycleEvent(session.id, 'aborted', {
          ...(scopedChatId ? { chatId: scopedChatId } : {}),
          requestedPath: session.metadata.path,
          agent: flavor,
          ...(selectedModel ? { model: selectedModel } : {}),
        });
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown runtime error';
      try {
        await this.appendAgentMessage(session.id, `에이전트 실행 오류: ${message}`, {
          ...(scopedChatId ? { chatId: scopedChatId } : {}),
          requestedPath: session.metadata.path,
          model: selectedModel,
          error: true,
        });
      } catch (persistError) {
        const persistMessage = persistError instanceof Error ? persistError.message : 'Unknown persist error';
        console.error(`failed to persist agent error message: ${persistMessage}`);
      }
      await this.appendRunLifecycleEvent(session.id, 'failed', {
        ...(scopedChatId ? { chatId: scopedChatId } : {}),
        requestedPath: session.metadata.path,
        agent: flavor,
        ...(selectedModel ? { model: selectedModel } : {}),
      });
    } finally {
      stopExternalAbortWatcher();
      if (flavor === 'gemini') {
        this.clearGeminiRealtimePartialsForScope({
          sessionId: session.id,
          chatId: scopedChatId,
        });
      }
      finalizeRun();
    }
  }

  async listSessions(): Promise<RuntimeSession[]> {
    const now = Date.now();
    if (this.sessionListCache && this.sessionListCache.expiresAt > now) {
      return this.sessionListCache.sessions;
    }
    const raw = await this.request<HappyListSessionsResponse>('/v1/sessions');
    const list = Array.isArray(raw.sessions) ? raw.sessions : [];
    const sessions = list
      .map((item) => (asRecord(item) ? (item as unknown as HappyBackendSession) : null))
      .filter((item): item is HappyBackendSession => item !== null && typeof item.id === 'string')
      .map(toRuntimeSession)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    this.sessionListCache = { sessions, expiresAt: now + this.SESSION_LIST_CACHE_TTL_MS };
    return sessions;
  }

  private invalidateSessionListCache(): void {
    this.sessionListCache = null;
  }

  async getSession(sessionId: string): Promise<RuntimeSession | null> {
    const sessions = await this.listSessions();
    return sessions.find((session) => session.id === sessionId) ?? null;
  }

  async getGeminiSessionCapabilities(sessionId: string): Promise<GeminiSessionCapabilities> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }
    return inspectGeminiAcpSessionCapabilities({
      cwd: this.resolveExecutionCwd(session.metadata.path, session.metadata.branch),
    });
  }

  async createSession(input: HappyRuntimeCreateInput): Promise<RuntimeSession> {
    const approvalPolicy = normalizeApprovalPolicy(input.approvalPolicy, DEFAULT_APPROVAL_POLICY);
    const model = normalizeModel(input.model);
    const metadata = JSON.stringify({
      flavor: input.flavor,
      path: input.path,
      approvalPolicy,
      ...(model ? { model } : {}),
      ...(input.branch ? { branch: input.branch } : {}),
      status: input.status ?? 'idle',
    });

    const tag = `aris-${input.flavor}-${randomUUID()}`;
    const response = await this.request<HappySessionResponse>('/v1/sessions', {
      method: 'POST',
      body: JSON.stringify({
        tag,
        metadata,
      }),
    });

    const mapped = this.mapHappyResponse(response)[0];
    if (!mapped) {
      throw new Error('Failed to create happy session');
    }
    this.invalidateSessionListCache();
    return toRuntimeSession(mapped);
  }

  async listMessages(
    sessionId: string,
    options: { afterSeq?: number; afterId?: string; limit?: number } = {},
  ): Promise<RuntimeMessage[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const hasPaginatedRequest = options.afterSeq !== undefined || options.afterId !== undefined || options.limit !== undefined;
    if (hasPaginatedRequest) {
      // afterId path: single DB-level query — no backward scan needed
      if (typeof options.afterId === 'string' && options.afterId) {
        const normalizedLimit = Number.isFinite(options.limit)
          ? Math.max(1, Math.min(HAPPY_MESSAGES_PAGE_MAX_LIMIT, Math.floor(Number(options.limit))))
          : HAPPY_MESSAGES_BATCH_LIMIT;
        const query = new URLSearchParams({
          after_id: options.afterId,
          limit: String(normalizedLimit),
        });
        const response = await this.request<HappyMessageResponse>(
          `/v3/sessions/${encodeURIComponent(sessionId)}/messages?${query.toString()}`,
        );
        const batch = Array.isArray(response.messages) ? response.messages : [];
        return batch
          .filter((message) => typeof message.id === 'string')
          .map((message) => toRuntimeMessage(sessionId, message))
          .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
      }

      const normalizedAfterSeq = Number.isFinite(options.afterSeq)
        ? Math.max(0, Math.floor(Number(options.afterSeq)))
        : 0;
      const normalizedLimit = Number.isFinite(options.limit)
        ? Math.max(1, Math.min(HAPPY_MESSAGES_PAGE_MAX_LIMIT, Math.floor(Number(options.limit))))
        : HAPPY_MESSAGES_BATCH_LIMIT;

      const collected: HappyBackendMessage[] = [];
      let nextAfterSeq = normalizedAfterSeq;
      let hasMore = true;

      while (collected.length < normalizedLimit && hasMore) {
        const remaining = normalizedLimit - collected.length;
        const pageLimit = Math.min(HAPPY_MESSAGES_BATCH_LIMIT, remaining);
        const query = new URLSearchParams({
          after_seq: String(nextAfterSeq),
          limit: String(pageLimit),
        });
        const response = await this.request<HappyMessageResponse>(
          `/v3/sessions/${encodeURIComponent(sessionId)}/messages?${query.toString()}`,
        );
        const batch = Array.isArray(response.messages) ? response.messages : [];
        if (batch.length === 0) {
          break;
        }
        collected.push(...batch);
        const maxSeq = batch.reduce((max, message) => {
          if (!Number.isFinite(message.seq) || message.seq <= max) {
            return max;
          }
          return message.seq;
        }, nextAfterSeq);
        hasMore = response.hasMore === true;
        if (!hasMore || maxSeq <= nextAfterSeq) {
          break;
        }
        nextAfterSeq = maxSeq;
      }

      return collected
        .filter((message) => typeof message.id === 'string')
        .map((message) => toRuntimeMessage(sessionId, message))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    }

    const messages = await this.listAllMessages(sessionId);
    return messages
      .filter((message) => typeof message.id === 'string')
      .map((message) => toRuntimeMessage(sessionId, message))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async listRealtimeEvents(
    sessionId: string,
    options: {
      afterCursor?: number;
      limit?: number;
      chatId?: string;
    } = {},
  ): Promise<{ events: RuntimeMessage[]; cursor: number }> {
    return this.realtimeEventBus.list(sessionId, options);
  }

  subscribeRealtimeEvents(
    sessionId: string,
    options: { chatId?: string } = {},
    listener: (record: { cursor: number; event: RuntimeMessage }) => void,
  ): () => void {
    return this.realtimeEventBus.subscribe(sessionId, options, listener);
  }

  private async listAllMessages(sessionId: string): Promise<HappyBackendMessage[]> {
    let afterSeq = 0;
    const allMessages: HappyBackendMessage[] = [];

    for (let page = 0; page < HAPPY_MESSAGES_MAX_PAGES; page += 1) {
      const query = new URLSearchParams({
        after_seq: String(afterSeq),
        limit: String(HAPPY_MESSAGES_BATCH_LIMIT),
      });
      const response = await this.request<HappyMessageResponse>(
        `/v3/sessions/${encodeURIComponent(sessionId)}/messages?${query.toString()}`,
      );
      const batch = Array.isArray(response.messages) ? response.messages : [];
      if (batch.length === 0) {
        break;
      }

      allMessages.push(...batch);

      const maxSeq = batch.reduce((max, message) => {
        if (!Number.isFinite(message.seq) || message.seq <= max) {
          return max;
        }
        return message.seq;
      }, afterSeq);

      if (response.hasMore !== true || maxSeq <= afterSeq) {
        break;
      }
      afterSeq = maxSeq;
    }

    return allMessages;
  }

  async appendMessage(sessionId: string, input: HappyRuntimeAppendInput): Promise<RuntimeMessage> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const localId = `aris-${randomUUID()}`;
    const content = JSON.stringify({
      role: input.meta?.role === 'agent' ? 'agent' : 'user',
      text: input.text,
      title: input.title,
      meta: input.meta ?? null,
      type: input.type || 'message',
      action: input.type,
    });

    const response = await this.request<HappyMessageResponse>(`/v3/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messages: [
          {
            localId,
            content,
          },
        ],
      }),
    });

    const posted = response.messages.find((item) => item.localId === localId)
      ?? response.messages[response.messages.length - 1];
    if (!posted) {
      return buildEchoMessage(sessionId, input, localId);
    }

    const created = toRuntimeMessage(sessionId, posted);

    const isUserPrompt = input.meta?.role !== 'agent';
    if (isUserPrompt) {
      const chatId = typeof input.meta?.chatId === 'string' && input.meta.chatId.trim().length > 0
        ? input.meta.chatId.trim()
        : undefined;
      const threadId = typeof input.meta?.threadId === 'string' && input.meta.threadId.trim().length > 0
        ? input.meta.threadId.trim()
        : undefined;
      const requestedAgent = normalizeAgent(input.meta?.agent);
      const requestedModel = normalizeModel(input.meta?.model);
      const requestedGeminiMode = normalizeGeminiMode(input.meta?.geminiMode);
      const customModel = normalizeModel(input.meta?.customModel);
      const modelReasoningEffort = normalizeModelReasoningEffort(
        input.meta?.modelReasoningEffort ?? input.meta?.model_reasoning_effort,
      );
      void this.generateAndPersistAgentReply(session, input.text, {
        chatId,
        threadId,
        ...(requestedAgent !== 'unknown' ? { agent: requestedAgent } : {}),
        ...(requestedModel ? { model: requestedModel } : {}),
        ...(requestedGeminiMode ? { geminiMode: requestedGeminiMode } : {}),
        ...(customModel ? { customModel } : {}),
        ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
      });
    }

    if (!created.text || !created.title) {
      return {
        ...buildEchoMessage(sessionId, input, posted.id || localId),
        createdAt: created.createdAt || new Date().toISOString(),
        type: created.type,
      };
    }
    return created;
  }

  async triggerPersistedUserMessage(sessionId: string, input: HappyRuntimeAppendInput): Promise<void> {
    if (input.meta?.role === 'agent') {
      return;
    }

    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const chatId = typeof input.meta?.chatId === 'string' && input.meta.chatId.trim().length > 0
      ? input.meta.chatId.trim()
      : undefined;
    const threadId = typeof input.meta?.threadId === 'string' && input.meta.threadId.trim().length > 0
      ? input.meta.threadId.trim()
      : undefined;
    const requestedAgent = normalizeAgent(input.meta?.agent);
    const requestedModel = normalizeModel(input.meta?.model);
    const requestedGeminiMode = normalizeGeminiMode(input.meta?.geminiMode);
    const customModel = normalizeModel(input.meta?.customModel);
    const modelReasoningEffort = normalizeModelReasoningEffort(
      input.meta?.modelReasoningEffort ?? input.meta?.model_reasoning_effort,
    );

    void this.generateAndPersistAgentReply(session, input.text, {
      chatId,
      threadId,
      ...(requestedAgent !== 'unknown' ? { agent: requestedAgent } : {}),
      ...(requestedModel ? { model: requestedModel } : {}),
      ...(requestedGeminiMode ? { geminiMode: requestedGeminiMode } : {}),
      ...(customModel ? { customModel } : {}),
      ...(modelReasoningEffort ? { modelReasoningEffort } : {}),
    });
  }

  async applySessionAction(sessionId: string, action: SessionAction, chatId?: string): Promise<{ accepted: boolean; message: string; at: string }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    if (action === 'abort' || action === 'kill') {
      this.abortSessionRuns(sessionId, action === 'abort' ? chatId : undefined);
    }

    if (action === 'kill') {
      this.clearCodexThreadsForSession(sessionId);
      try {
        await this.request(`/v1/sessions/${encodeURIComponent(sessionId)}`, {
          method: 'DELETE',
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.includes('(404)')) {
          throw new Error('SESSION_NOT_FOUND');
        }
        throw error;
      }
      this.invalidateSessionListCache();
    }

    return {
      accepted: true,
      message: `${action.toUpperCase()} acknowledged`,
      at: new Date().toISOString(),
    };
  }

  async isSessionRunning(sessionId: string, chatId?: string): Promise<boolean> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }
    await this.cleanupStaleRuns('runtime_status_poll');
    if (this.claudeSessionRegistry.isRunning({ sessionId, chatId })) {
      return true;
    }
    if (chatId && chatId.trim().length > 0) {
      return this.activeRunRegistry.has(buildRunKey(sessionId, chatId));
    }
    for (const runKey of this.activeRunRegistry.keys()) {
      if (isSessionRunKey(runKey, sessionId)) {
        return true;
      }
    }
    return false;
  }

  async listPermissions(state?: PermissionState): Promise<PermissionRequest[]> {
    return this.permissionRouter.listPermissions(state);
  }

  async createPermission(input: HappyRuntimePermissionInput): Promise<PermissionRequest> {
    return this.permissionRouter.createPermission(input);
  }

  async decidePermission(permissionId: string, decision: PermissionDecision): Promise<PermissionRequest> {
    return this.permissionRouter.decidePermission(permissionId, decision);
  }
}
