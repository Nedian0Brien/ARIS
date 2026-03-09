import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import { inferActionTypeFromCommand, titleForActionType } from './actionType.js';
import { summarizeDiffText, summarizeFileChangeDiff } from './diffStats.js';
import { HappyEventLogger } from './happyEventLogger.js';
import type {
  ApprovalPolicy,
  PermissionDecision,
  PermissionRequest,
  PermissionRisk,
  RuntimeMessage,
  RuntimeSession,
  SessionAction,
} from '../types.js';

const execFileAsync = promisify(execFile);
const AGENT_COMMAND_TIMEOUT_MS = 120_000;
const AGENT_MAX_OUTPUT_CHARS = 32_000;
const AGENT_EXTRA_PATHS = [
  '/home/ubuntu/.local/bin',
  '/home/ubuntu/.nvm/versions/node/v22.17.1/bin',
].join(':');
const DEFAULT_APPROVAL_POLICY = normalizeApprovalPolicy(process.env.CODEX_APPROVAL_POLICY, 'on-request');
const CODEX_SANDBOX_MODE = (process.env.CODEX_SANDBOX_MODE || 'workspace-write').trim();
const CODEX_RUNTIME_MODE = (process.env.CODEX_RUNTIME_MODE || 'app-server').trim().toLowerCase();
const HAPPY_MESSAGES_BATCH_LIMIT = 500;
const HAPPY_MESSAGES_PAGE_MAX_LIMIT = 2000;
const HAPPY_MESSAGES_MAX_PAGES = 1000;
const HAPPY_EVENT_LOG_DIR = path.resolve(process.cwd(), 'logs');
const HAPPY_EVENT_LOG_MAX_BYTES = (() => {
  const parsed = Number.parseInt(process.env.HAPPY_EVENT_LOG_MAX_BYTES || '', 10);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return 1_024 * 1_024 * 1_024; // 1GB
})();

type RuntimeAgent = RuntimeSession['metadata']['flavor'];
type PermissionState = PermissionRequest['state'];
type SessionStatusValue = RuntimeSession['state']['status'];
type PermissionActionType = 'exec' | 'patch';
type JsonRpcId = string | number | null;

type CodexPermissionRequest = {
  actionType: PermissionActionType;
  callId: string;
  approvalId?: string;
  command: string;
  reason: string;
  risk: PermissionRisk;
};

type HappyRuntimeCreateInput = {
  path: string;
  flavor: RuntimeAgent;
  approvalPolicy?: ApprovalPolicy;
  model?: string;
  status?: SessionStatusValue;
  riskScore?: number;
};

type HappyRuntimeAppendInput = {
  type: string;
  title?: string;
  text: string;
  meta?: Record<string, unknown>;
};

type HappyRuntimePermissionInput = {
  sessionId: string;
  agent: PermissionRequest['agent'];
  command: string;
  reason: string;
  risk: PermissionRisk;
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
  return trimmed.slice(0, 120);
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

function normalizeCodexApprovalPolicy(value: ApprovalPolicy): 'on-request' | 'on-failure' | 'never' {
  if (value === 'on-failure' || value === 'never' || value === 'on-request') {
    return value;
  }
  return 'on-request';
}

function normalizeClaudePermissionMode(value: ApprovalPolicy): 'default' | 'dontAsk' | 'bypassPermissions' {
  if (value === 'never') {
    return 'dontAsk';
  }
  if (value === 'yolo') {
    return 'bypassPermissions';
  }
  return 'default';
}

function normalizeMetadata(raw: unknown): {
  flavor: RuntimeAgent;
  path: string;
  approvalPolicy: ApprovalPolicy;
  model?: string;
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

  return {
    role,
    title,
    text,
    meta,
  };
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

type AgentCommand = {
  command: string;
  args: string[];
  requiresPty?: boolean;
  streamJson?: boolean;
  fallbackArgs?: string[];
};

type ParsedAgentActionEvent = {
  actionType: 'command_execution' | 'file_list' | 'file_read' | 'file_write';
  title: string;
  command?: string;
  path?: string;
  output?: string;
  additions: number;
  deletions: number;
  hasDiffSignal: boolean;
};

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

function parseAgentStreamOutput(stdout: string): { output: string; actions: ParsedAgentActionEvent[] } {
  const lines = stdout
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const actionByKey = new Map<string, ParsedAgentActionEvent>();
  let latestAssistantText = '';

  for (const line of lines) {
    const payload = parseJsonLine(line);
    if (!payload) {
      continue;
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
      const key = `${actionType}|${command}|${resolvedPath}`;
      if (!actionByKey.has(key)) {
        actionByKey.set(key, {
          actionType,
          title: titleForActionType(actionType),
          command: command || undefined,
          path: resolvedPath || undefined,
          output: outputCandidate || undefined,
          additions: diffStats.additions,
          deletions: diffStats.deletions,
          hasDiffSignal: diffStats.hasDiffSignal,
        });
      }
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
    if (!isSystem && !seemsToolEvent && seemsAssistantEvent) {
      const assistantText = extractFirstStringByKeys(records, ['text', 'message', 'content', 'output']);
      if (
        assistantText
        && !looksLikeShellCommand(assistantText)
        && !looksLikeActionTranscript(assistantText)
        && assistantText.length >= latestAssistantText.length
      ) {
        latestAssistantText = assistantText;
      }
    }
  }

  return {
    output: latestAssistantText,
    actions: [...actionByKey.values()],
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

function mapCodexDecisionForCommandApproval(decision: PermissionDecision): string {
  if (decision === 'allow_session') {
    return 'acceptForSession';
  }
  if (decision === 'deny') {
    return 'decline';
  }
  return 'accept';
}

function mapCodexDecisionForPatchApproval(decision: PermissionDecision): string {
  if (decision === 'allow_session') {
    return 'acceptForSession';
  }
  if (decision === 'deny') {
    return 'decline';
  }
  return 'accept';
}

function mapCodexDecisionForLegacyReview(decision: PermissionDecision): string {
  if (decision === 'allow_session') {
    return 'approved_for_session';
  }
  if (decision === 'deny') {
    return 'denied';
  }
  return 'approved';
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

function isMissingCodexThreadError(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();
  if (!message.includes('thread') && !message.includes('session')) {
    return false;
  }

  return (
    message.includes('not found')
    || message.includes('unknown')
    || message.includes('invalid')
    || message.includes('does not exist')
    || message.includes('no such')
  );
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

function normalizeCodexApprovalDecision(value: unknown): PermissionRisk {
  const text = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (text === 'low' || text === 'medium' || text === 'high') {
    return text;
  }
  return 'medium';
}

function inferCodexApprovalRisk(payload: Record<string, unknown>, fallback: PermissionRisk = 'medium'): PermissionRisk {
  const directRisk = normalizeCodexApprovalDecision(payload.risk);
  if (directRisk !== 'medium' || String(payload.risk ?? '').trim().length > 0) {
    return directRisk;
  }

  const hasNetworkContext = asRecord(payload.network_approval_context) !== null;
  const networkPolicyAmendments = payload.proposed_network_policy_amendments;
  const hasNetworkAmendments = Array.isArray(networkPolicyAmendments) && networkPolicyAmendments.length > 0;
  const additionalPermissions = asRecord(payload.additional_permissions);
  const hasAdditionalPermissions = additionalPermissions !== null && Object.keys(additionalPermissions).length > 0;
  const grantRoot = asString(payload.grant_root, '').trim();

  if (hasNetworkContext || hasNetworkAmendments || hasAdditionalPermissions || grantRoot) {
    return 'high';
  }

  return fallback;
}

function extractCodexPermissionRequest(payload: Record<string, unknown>): CodexPermissionRequest | null {
  const payloadType = asString(payload.type, '').trim();
  const item = payloadType === 'item.completed' ? asRecord(payload.item) : payload;
  if (!item) {
    return null;
  }

  const itemType = asString(item.type, '').trim();
  if (itemType !== 'exec_approval_request' && itemType !== 'apply_patch_approval_request') {
    return null;
  }

  const callId = asString(item.call_id, asString(item.item_id, '')).trim();
  if (!callId) {
    return null;
  }

  const approvalId = asString(item.approval_id, '').trim() || undefined;
  if (itemType === 'exec_approval_request') {
    const rawCommand = asString(item.command, asString(item.parsed_cmd, asString(item.interaction_input, ''))).trim();
    const command = unwrapShellCommand(rawCommand || `exec command (${callId})`);
    const reason = asString(item.reason, '명령 실행을 위해 사용자 승인이 필요합니다.').trim();
    return {
      actionType: 'exec',
      callId,
      approvalId,
      command,
      reason,
      risk: inferCodexApprovalRisk(item),
    };
  }

  const grantRoot = asString(item.grant_root, '').trim();
  const command = grantRoot ? `apply_patch (grant_root: ${grantRoot})` : 'apply_patch';
  const reason = asString(item.reason, '패치 적용을 위해 사용자 승인이 필요합니다.').trim();
  return {
    actionType: 'patch',
    callId,
    approvalId,
    command,
    reason,
    risk: inferCodexApprovalRisk(item),
  };
}

function buildCodexPermissionKey(sessionId: string, request: CodexPermissionRequest): string {
  return `${sessionId}:${request.approvalId || request.callId}`;
}

function inferCodexFileWriteItem(item: Record<string, unknown>): {
  command: string;
  path?: string;
  detail?: string;
  status?: string;
  additions: number;
  deletions: number;
  hasDiffSignal: boolean;
} | null {
  const itemType = asString(item.type, '').trim().toLowerCase();
  if (!itemType || itemType.includes('approval')) {
    return null;
  }
  if (itemType === 'agentmessage' || itemType === 'agent_message') {
    return null;
  }
  if (itemType === 'commandexecution' || itemType === 'command_execution') {
    return null;
  }

  const isFileWriteType = (
    itemType.includes('filechange')
    || itemType.includes('file_change')
    || itemType.includes('apply_patch')
    || itemType.includes('applypatch')
    || itemType === 'patch'
  );

  if (!isFileWriteType) {
    return null;
  }

  const pickPathFromArray = (value: unknown): string => {
    if (!Array.isArray(value)) {
      return '';
    }
    for (const entry of value) {
      if (typeof entry === 'string' && entry.trim()) {
        return entry.trim();
      }
      const rec = asRecord(entry);
      const candidate = asString(
        rec?.path,
        asString(
          rec?.file_path,
          asString(rec?.filePath, asString(rec?.target_path, asString(rec?.targetPath, ''))),
        ),
      ).trim();
      if (candidate) {
        return candidate;
      }
    }
    return '';
  };

  const pickDiffFromArray = (value: unknown): string => {
    if (!Array.isArray(value)) {
      return '';
    }

    const details: string[] = [];
    for (const entry of value) {
      const rec = asRecord(entry);
      if (!rec) {
        continue;
      }
      const candidate = asString(
        rec.diff,
        asString(
          rec.patch,
          asString(rec.unified_diff, asString(rec.unifiedDiff, asString(rec.text, asString(rec.result, '')))),
        ),
      ).trim();
      if (candidate) {
        details.push(candidate);
      }
    }

    return details.join('\n').trim();
  };

  const pickDiffStatsFromArray = (value: unknown): { additions: number; deletions: number; hasDiffSignal: boolean } => {
    if (!Array.isArray(value)) {
      return { additions: 0, deletions: 0, hasDiffSignal: false };
    }

    let additions = 0;
    let deletions = 0;
    let hasDiffSignal = false;

    for (const entry of value) {
      const rec = asRecord(entry);
      if (!rec) {
        continue;
      }

      const kind = asString(asRecord(rec.kind)?.type, asString(rec.kind, '')).trim();
      const candidate = asString(
        rec.diff,
        asString(
          rec.patch,
          asString(rec.unified_diff, asString(rec.unifiedDiff, asString(rec.text, asString(rec.result, '')))),
        ),
      ).trim();
      if (!candidate) {
        continue;
      }

      const stats = summarizeFileChangeDiff(candidate, kind);
      additions += stats.additions;
      deletions += stats.deletions;
      hasDiffSignal = hasDiffSignal || stats.hasDiffSignal;
    }

    return { additions, deletions, hasDiffSignal };
  };

  const arrayPath = pickPathFromArray(item.paths)
    || pickPathFromArray(item.files)
    || pickPathFromArray(item.changes)
    || pickPathFromArray(item.changed_files)
    || pickPathFromArray(item.changedFiles);

  const path = asString(
    item.path,
    asString(
      item.file_path,
      asString(
        item.filePath,
        asString(
          item.target_path,
          asString(item.targetPath, asString(item.relative_path, asString(item.relativePath, arrayPath))),
        ),
      ),
    ),
  ).trim() || undefined;
  const commandRaw = asString(item.command, '').trim();
  const command = unwrapShellCommand(commandRaw || 'apply_patch');
  const arrayDiff = pickDiffFromArray(item.changes);
  const detailRaw = stripAnsi(asString(
    item.diff,
    asString(
      item.patch,
      asString(
        item.unified_diff,
        asString(
          item.unifiedDiff,
          asString(item.output, asString(item.text, asString(item.result, arrayDiff))),
        ),
      ),
    ),
  )).trim();
  const detail = detailRaw && detailRaw.toLowerCase() !== 'apply_patch' ? detailRaw : undefined;
  const status = asString(item.status, '').trim() || undefined;
  const directDiffStats = summarizeDiffText(detailRaw);
  const arrayDiffStats = pickDiffStatsFromArray(item.changes);
  const diffStats = directDiffStats.hasDiffSignal
    ? directDiffStats
    : arrayDiffStats.hasDiffSignal
      ? arrayDiffStats
      : directDiffStats;

  if (!path && !detail) {
    return null;
  }

  return { command, path, detail, status, ...diffStats };
}

function buildCodexThreadCacheKey(sessionId: string, chatId?: string): string {
  if (chatId && chatId.trim().length > 0) {
    return `${sessionId}:${chatId.trim()}`;
  }
  return sessionId;
}

function buildAgentCommand(
  agent: RuntimeAgent,
  prompt: string,
  approvalPolicy: ApprovalPolicy,
  model?: string,
): AgentCommand | null {
  const selectedModel = normalizeModel(model);
  if (agent === 'claude') {
    const permissionMode = normalizeClaudePermissionMode(approvalPolicy);
    return {
      command: 'claude',
      args: [
        '--print',
        '--output-format',
        'stream-json',
        '--verbose',
        '--permission-mode',
        permissionMode,
        ...(selectedModel ? ['--model', selectedModel] : []),
        prompt,
      ],
      fallbackArgs: [
        '--print',
        '--permission-mode',
        permissionMode,
        ...(selectedModel ? ['--model', selectedModel] : []),
        prompt,
      ],
      requiresPty: true,
      streamJson: true,
    };
  }
  if (agent === 'gemini') {
    return {
      command: 'gemini',
      args: [
        ...(selectedModel ? ['-m', selectedModel] : []),
        '--output-format',
        'stream-json',
        '-p',
        prompt,
      ],
      fallbackArgs: [
        ...(selectedModel ? ['-m', selectedModel] : []),
        '-p',
        prompt,
      ],
      streamJson: true,
    };
  }
  return null;
}

export const happyClientTestHooks = {
  parseAgentStreamOutput,
  looksLikeActionTranscript,
};

export class HappyRuntimeStore {
  private readonly permissions = new Map<string, PermissionRequest>();
  private readonly activeRuns = new Map<string, AbortController>();
  private readonly codexThreads = new Map<string, string>();
  private readonly codexPermissionIndex = new Map<string, string>();
  private readonly codexPermissionResponders = new Map<string, (decision: PermissionDecision) => Promise<void>>();

  private readonly serverUrl: string;
  private readonly serverToken: string;
  private readonly workspaceRoot: string;
  private readonly hostProjectsRoot: string;
  private readonly happyEventLogger: HappyEventLogger;

  constructor(opts: { serverUrl: string; token: string; workspaceRoot?: string; hostProjectsRoot?: string }) {
    this.serverUrl = opts.serverUrl.replace(/\/+$/, '');
    this.serverToken = opts.token;
    this.workspaceRoot = (opts.workspaceRoot || '/workspace').replace(/\/+$/, '');
    this.hostProjectsRoot = (opts.hostProjectsRoot || '').replace(/\/+$/, '');
    this.happyEventLogger = new HappyEventLogger(HAPPY_EVENT_LOG_DIR, HAPPY_EVENT_LOG_MAX_BYTES);
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

  private buildRunKey(sessionId: string, chatId?: string): string {
    if (chatId && chatId.trim().length > 0) {
      return `${sessionId}:${chatId.trim()}`;
    }
    return `${sessionId}:__default__`;
  }

  private isSessionRunKey(runKey: string, sessionId: string): boolean {
    return runKey === `${sessionId}:__default__` || runKey.startsWith(`${sessionId}:`);
  }

  private abortSessionRuns(sessionId: string): void {
    for (const [runKey, controller] of this.activeRuns.entries()) {
      if (!this.isSessionRunKey(runKey, sessionId)) {
        continue;
      }
      if (!controller.signal.aborted) {
        controller.abort();
      }
      this.activeRuns.delete(runKey);
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

  resolveExecutionCwd(cwdHint?: string): string {
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
        return candidate;
      }
    }

    throw new Error(`Session project path not found on backend host: ${raw}`);
  }

  private async runAgentCli(
    agent: RuntimeAgent,
    prompt: string,
    approvalPolicy: ApprovalPolicy,
    model?: string,
    cwdHint?: string,
    signal?: AbortSignal,
  ): Promise<{ output: string; cwd: string; inferredActions: ParsedAgentActionEvent[] }> {
    const command = buildAgentCommand(agent, prompt, approvalPolicy, model);
    if (!command) {
      throw new Error(`Unsupported agent flavor: ${agent}`);
    }

    const safeCwd = this.resolveExecutionCwd(cwdHint);
    const mergedPath = `${process.env.PATH || ''}:${AGENT_EXTRA_PATHS}`;
    const runCommand = async (args: string[]): Promise<{ stdout: string; stderr: string }> => (
      command.requiresPty
        ? execFileAsync(
          'script',
          ['-q', '-c', `${shellEscapeSingle(command.command)} ${args.map(shellEscapeSingle).join(' ')}`, '/dev/null'],
          {
            cwd: safeCwd,
            timeout: AGENT_COMMAND_TIMEOUT_MS,
            maxBuffer: 8 * 1024 * 1024,
            env: { ...process.env, PATH: mergedPath },
            signal,
          },
        )
        : execFileAsync(command.command, args, {
          cwd: safeCwd,
          timeout: AGENT_COMMAND_TIMEOUT_MS,
          maxBuffer: 8 * 1024 * 1024,
          env: { ...process.env, PATH: mergedPath },
          signal,
        })
    );

    let result: { stdout: string; stderr: string };
    try {
      result = await runCommand(command.args);
    } catch (error) {
      if (isAbortFailure(error)) {
        throw error;
      }
      const asRecord = error as { stdout?: string; stderr?: string; message?: string };
      const stdout = stripAnsi(asRecord.stdout || '');
      const stderr = stripAnsi(asRecord.stderr || '');
      const detail = stderr || stdout || asRecord.message || 'Unknown CLI error';
      throw new Error(`${agent} CLI failed: ${detail.slice(0, 800)}`);
    }

    const cleanedStdout = stripAnsi(result.stdout || '');
    const cleanedStderr = stripAnsi(result.stderr || '');
    let inferredActions: ParsedAgentActionEvent[] = [];
    let output = '';
    if (command.streamJson) {
      const parsed = parseAgentStreamOutput(cleanedStdout);
      inferredActions = parsed.actions;
      output = trimOutput(parsed.output || '');
      const needsFallback = !output || looksLikeActionTranscript(output);
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
        output = trimOutput(nonJsonStdout || cleanedStderr || '');
      }
    } else {
      output = trimOutput(cleanedStdout || cleanedStderr || '');
    }
    if (!output) {
      throw new Error(`${agent} returned an empty response`);
    }
    return { output, cwd: safeCwd, inferredActions };
  }

  private async appendAgentMessage(
    sessionId: string,
    text: string,
    meta: Record<string, unknown> = {},
    options: { type?: string; title?: string } = {},
  ): Promise<void> {
    const cleanedText = text.replace(/\n?0;\s*$/g, '').trim();
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

    await this.request<HappyMessageResponse>(`/v3/sessions/${encodeURIComponent(sessionId)}/messages`, {
      method: 'POST',
      body: JSON.stringify({
        messages: [{ localId, content }],
      }),
    });
  }

  private async runCodexCliWithEvents(
    session: RuntimeSession,
    prompt: string,
    signal?: AbortSignal,
    threadId?: string,
    chatId?: string,
    model?: string,
  ): Promise<{ output: string; cwd: string; streamedPersisted: boolean; agentMessagePersisted: boolean; threadId?: string }> {
    if (CODEX_RUNTIME_MODE === 'exec') {
      return this.runCodexExecCliWithEvents(session, prompt, signal, threadId, chatId, model);
    }

    try {
      return await this.runCodexAppServerWithEvents(session, prompt, signal, threadId, chatId, model);
    } catch (error) {
      if (isMissingCodexThreadError(error)) {
        throw error;
      }
      if (CODEX_RUNTIME_MODE === 'app-server-strict') {
        throw error;
      }

      const detail = error instanceof Error ? error.message : String(error);
      console.error(`codex app-server mode failed; falling back to exec mode: ${detail}`);
      return this.runCodexExecCliWithEvents(session, prompt, signal, threadId, chatId, model);
    }
  }

  private async runCodexAppServerWithEvents(
    session: RuntimeSession,
    prompt: string,
    signal?: AbortSignal,
    threadId?: string,
    chatId?: string,
    model?: string,
  ): Promise<{ output: string; cwd: string; streamedPersisted: boolean; agentMessagePersisted: boolean; threadId?: string }> {
    const safeCwd = this.resolveExecutionCwd(session.metadata.path);
    const threadCacheKey = buildCodexThreadCacheKey(session.id, chatId);
    const sessionApprovalPolicy = this.resolveSessionApprovalPolicy(session);
    const codexApprovalPolicy = normalizeCodexApprovalPolicy(sessionApprovalPolicy);
    const selectedModel = normalizeModel(model) ?? normalizeModel(session.metadata.model);
    const autoApproveAll = sessionApprovalPolicy === 'yolo';
    const mergedPath = `${process.env.PATH || ''}:${AGENT_EXTRA_PATHS}`;
    const args = [
      ...(selectedModel ? ['-c', `model=${JSON.stringify(selectedModel)}`] : []),
      'app-server',
      '--listen',
      'stdio://',
    ];
    const child = spawn('codex', args, {
      cwd: safeCwd,
      env: { ...process.env, PATH: mergedPath },
      stdio: ['pipe', 'pipe', 'pipe'],
      signal,
    });

    if (!child.stdin || !child.stdout || !child.stderr) {
      throw new Error('codex app-server stdio streams are unavailable');
    }

    const stdoutLines = createInterface({ input: child.stdout });
    let stderr = '';
    let appendChain: Promise<void> = Promise.resolve();
    let permissionChain: Promise<void> = Promise.resolve();
    let lastAgentMessage = '';
    let pendingAgentMessage = '';
    let streamedPersisted = false;
    let agentMessagePersisted = false;
    let resolvedThreadId = typeof threadId === 'string' && threadId.trim().length > 0
      ? threadId.trim()
      : '';
    let activeTurnId = '';
    let turnCompleted = false;
    const runtimePermissionIds = new Set<string>();

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

    const childClosed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', (code, closeSignal) => resolve({ code, signal: closeSignal }));
    });

    const enqueueAppend = (
      text: string,
      meta: Record<string, unknown>,
      options: { type?: string; title?: string } = {},
    ) => {
      this.happyEventLogger.logParsed({
        sessionId: session.id,
        ...(chatId ? { chatId } : {}),
        channel: 'app_server',
        stage: 'parsed_append',
        payload: {
          text,
          meta,
          options,
        },
      });
      appendChain = appendChain
        .then(() => this.appendAgentMessage(session.id, text, meta, options))
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`failed to persist codex app-server event: ${message}`);
        });
    };

    const sendJsonRpc = (payload: Record<string, unknown>): Promise<void> => new Promise((resolve, reject) => {
      if (!child.stdin || child.stdin.destroyed || !child.stdin.writable) {
        reject(new Error('codex app-server stdin is not writable'));
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
      const knownPermissionId = this.codexPermissionIndex.get(key);
      if (knownPermissionId) {
        const knownPermission = this.permissions.get(knownPermissionId);
        if (knownPermission?.state === 'pending') {
          this.codexPermissionResponders.set(knownPermissionId, responder);
          runtimePermissionIds.add(knownPermissionId);
          if (autoApproveAll) {
            await this.decidePermission(knownPermissionId, 'allow_session');
          }
          return;
        }
        this.codexPermissionIndex.delete(key);
      }

      const created = await this.createPermission({
        sessionId: session.id,
        agent: session.metadata.flavor === 'codex' ? 'codex' : 'unknown',
        command,
        reason,
        risk,
      });

      this.codexPermissionIndex.set(key, created.id);
      this.codexPermissionResponders.set(created.id, responder);
      runtimePermissionIds.add(created.id);
      if (autoApproveAll) {
        await this.decidePermission(created.id, 'allow_session');
      }
    };

    const handleServerRequest = async (payload: Record<string, unknown>): Promise<void> => {
      const method = asString(payload.method, '').trim();
      const requestId = payload.id;
      const params = asRecord(payload.params) ?? {};
      const requestIdKey = toJsonRpcIdKey(requestId);

      if (method === 'item/commandExecution/requestApproval') {
        const itemId = asString(params.itemId, '').trim();
        const approvalId = asString(params.approvalId, '').trim();
        const callId = approvalId || itemId || requestIdKey;
        const commandRaw = asString(params.command, `command (${callId})`);
        const reason = asString(params.reason, '명령 실행을 위해 사용자 승인이 필요합니다.').trim();
        const hasNetworkContext = asRecord(params.networkApprovalContext) !== null;
        const hasAdditionalPermissions = asRecord(params.additionalPermissions) !== null;
        const hasNetworkAmendments = Array.isArray(params.proposedNetworkPolicyAmendments)
          && params.proposedNetworkPolicyAmendments.length > 0;
        const risk: PermissionRisk = hasNetworkContext || hasAdditionalPermissions || hasNetworkAmendments
          ? 'high'
          : 'medium';
        const key = `${session.id}:cmd:${approvalId || itemId || requestIdKey}`;
        await registerPermissionResponder(
          key,
          unwrapShellCommand(commandRaw),
          reason,
          risk,
          (decision) => sendJsonRpcResult(requestId, { decision: mapCodexDecisionForCommandApproval(decision) }),
        );
        return;
      }

      if (method === 'item/fileChange/requestApproval') {
        const itemId = asString(params.itemId, '').trim();
        const grantRoot = asString(params.grantRoot, '').trim();
        const reason = asString(params.reason, '패치 적용을 위해 사용자 승인이 필요합니다.').trim();
        const command = grantRoot ? `apply_patch (grant_root: ${grantRoot})` : 'apply_patch';
        const key = `${session.id}:patch:${itemId || requestIdKey}`;
        await registerPermissionResponder(
          key,
          command,
          reason,
          grantRoot ? 'high' : 'medium',
          (decision) => sendJsonRpcResult(requestId, { decision: mapCodexDecisionForPatchApproval(decision) }),
        );
        return;
      }

      if (method === 'execCommandApproval') {
        const callId = asString(params.callId, requestIdKey).trim();
        const approvalId = asString(params.approvalId, '').trim();
        const commandParts = Array.isArray(params.command)
          ? params.command.filter((part): part is string => typeof part === 'string')
          : [];
        const command = commandParts.length > 0 ? commandParts.join(' ') : `exec command (${callId})`;
        const reason = asString(params.reason, '명령 실행을 위해 사용자 승인이 필요합니다.').trim();
        const key = `${session.id}:legacy-exec:${approvalId || callId}`;
        await registerPermissionResponder(
          key,
          unwrapShellCommand(command),
          reason,
          'medium',
          (decision) => sendJsonRpcResult(requestId, { decision: mapCodexDecisionForLegacyReview(decision) }),
        );
        return;
      }

      if (method === 'applyPatchApproval') {
        const callId = asString(params.callId, requestIdKey).trim();
        const grantRoot = asString(params.grantRoot, '').trim();
        const reason = asString(params.reason, '패치 적용을 위해 사용자 승인이 필요합니다.').trim();
        const command = grantRoot ? `apply_patch (grant_root: ${grantRoot})` : 'apply_patch';
        const key = `${session.id}:legacy-patch:${callId}`;
        await registerPermissionResponder(
          key,
          command,
          reason,
          grantRoot ? 'high' : 'medium',
          (decision) => sendJsonRpcResult(requestId, { decision: mapCodexDecisionForLegacyReview(decision) }),
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
          this.codexThreads.set(threadCacheKey, startedThreadId);
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
          const text = asString(item.text, '').trim();
          if (!text) {
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
          if (fileWrite.status && fileWrite.status !== 'completed' && fileWrite.status !== 'inProgress') {
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
        if (status && status !== 'completed' && status !== 'inProgress') {
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
          const recoveredText = pendingAgentMessage.trim();
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
        turnCompleted = true;
        resolveTurnCompletion?.({ status, errorMessage });
      }
    };

    child.stderr.on('data', (chunk: Buffer | string) => {
      stderr += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
    });

    stdoutLines.on('line', (line) => {
      const rawLine = line.trim();
      this.happyEventLogger.logRaw({
        sessionId: session.id,
        ...(chatId ? { chatId } : {}),
        channel: 'app_server',
        line: rawLine,
      });
      const payload = parseJsonLine(rawLine);
      if (!payload) {
        this.happyEventLogger.logParsed({
          sessionId: session.id,
          ...(chatId ? { chatId } : {}),
          channel: 'app_server',
          stage: 'incoming_payload',
          payload: { parseError: 'invalid_json' },
        });
        return;
      }
      this.happyEventLogger.logParsed({
        sessionId: session.id,
        ...(chatId ? { chatId } : {}),
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
    });

    const closeChild = async () => {
      stdoutLines.close();
      if (child.stdin && !child.stdin.destroyed) {
        child.stdin.end();
      }
      if (!child.killed) {
        child.kill('SIGTERM');
      }
      await Promise.race([
        childClosed,
        new Promise<void>((resolve) => setTimeout(resolve, 1_500)),
      ]).catch(() => undefined);
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
          sandbox: CODEX_SANDBOX_MODE,
          persistExtendedHistory: true,
        });
        const resumedThreadId = asString(asRecord(resumed.thread)?.id, '').trim();
        if (resumedThreadId) {
          resolvedThreadId = resumedThreadId;
          this.codexThreads.set(threadCacheKey, resumedThreadId);
        }
      } else {
        const started = await sendRequest('thread/start', {
          cwd: safeCwd,
          approvalPolicy: codexApprovalPolicy,
          sandbox: CODEX_SANDBOX_MODE,
          experimentalRawEvents: false,
          persistExtendedHistory: true,
        });
        const startedThreadId = asString(asRecord(started.thread)?.id, '').trim();
        if (startedThreadId) {
          resolvedThreadId = startedThreadId;
          this.codexThreads.set(threadCacheKey, startedThreadId);
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

      const completion = await Promise.race([
        turnCompletion,
        childClosed.then(({ code }) => {
          throw new Error(`codex app-server closed before turn completion (exit code ${code ?? 'null'})`);
        }),
      ]);

      await appendChain;
      await permissionChain;

      const finalText = lastAgentMessage.trim();
      if (signal?.aborted || completion.status === 'interrupted') {
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
        throw new Error(`codex app-server turn failed${suffix}`);
      }

      return {
        output: trimOutput(finalText),
        cwd: safeCwd,
        streamedPersisted,
        agentMessagePersisted,
        threadId: resolvedThreadId || undefined,
      };
    } finally {
      for (const [key, pending] of pendingRequests.entries()) {
        pending.reject(new Error(`JSON-RPC request cancelled: ${pending.method}`));
        pendingRequests.delete(key);
      }

      await permissionChain.catch(() => undefined);
      await appendChain.catch(() => undefined);

      for (const permissionId of runtimePermissionIds) {
        this.codexPermissionResponders.delete(permissionId);

        for (const [key, mappedPermissionId] of this.codexPermissionIndex.entries()) {
          if (mappedPermissionId === permissionId) {
            this.codexPermissionIndex.delete(key);
          }
        }

        const existing = this.permissions.get(permissionId);
        if (existing?.state === 'pending') {
          this.permissions.set(permissionId, { ...existing, state: 'denied' });
        }
      }

      if (!turnCompleted && !signal?.aborted && stderr.trim()) {
        console.error(`codex app-server stderr: ${stripAnsi(stderr).slice(0, 800)}`);
      }

      await closeChild();
    }
  }

  private async runCodexExecCliWithEvents(
    session: RuntimeSession,
    prompt: string,
    signal?: AbortSignal,
    threadId?: string,
    chatId?: string,
    model?: string,
  ): Promise<{ output: string; cwd: string; streamedPersisted: boolean; agentMessagePersisted: boolean; threadId?: string }> {
    const safeCwd = this.resolveExecutionCwd(session.metadata.path);
    const threadCacheKey = buildCodexThreadCacheKey(session.id, chatId);
    const sessionApprovalPolicy = this.resolveSessionApprovalPolicy(session);
    const codexApprovalPolicy = normalizeCodexApprovalPolicy(sessionApprovalPolicy);
    const selectedModel = normalizeModel(model) ?? normalizeModel(session.metadata.model);
    const autoApproveAll = sessionApprovalPolicy === 'yolo';
    const mergedPath = `${process.env.PATH || ''}:${AGENT_EXTRA_PATHS}`;
    const execArgs = threadId
      ? ['exec', 'resume', threadId, '--json', prompt]
      : ['exec', '--json', prompt];
    const args = [
      '-a',
      codexApprovalPolicy,
      '-s',
      CODEX_SANDBOX_MODE,
      ...(selectedModel ? ['-m', selectedModel] : []),
      ...execArgs,
    ];
    const child = spawn('codex', args, {
      cwd: safeCwd,
      env: { ...process.env, PATH: mergedPath },
      stdio: ['pipe', 'pipe', 'pipe'],
      signal,
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

    const enqueueAppend = (
      text: string,
      meta: Record<string, unknown>,
      options: { type?: string; title?: string } = {},
    ) => {
      this.happyEventLogger.logParsed({
        sessionId: session.id,
        ...(chatId ? { chatId } : {}),
        channel: 'exec_cli',
        stage: 'parsed_append',
        payload: {
          text,
          meta,
          options,
        },
      });
      appendChain = appendChain
        .then(() => this.appendAgentMessage(session.id, text, meta, options))
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
          const key = buildCodexPermissionKey(session.id, request);
          const knownPermissionId = this.codexPermissionIndex.get(key);
          if (knownPermissionId) {
            const knownPermission = this.permissions.get(knownPermissionId);
            if (knownPermission?.state === 'pending') {
              if (autoApproveAll) {
                await this.decidePermission(knownPermissionId, 'allow_session');
              }
              return;
            }
            this.codexPermissionIndex.delete(key);
          }

          const created = await this.createPermission({
            sessionId: session.id,
            agent: session.metadata.flavor === 'codex' ? 'codex' : 'unknown',
            command: request.command,
            reason: request.reason,
            risk: request.risk,
          });

          this.codexPermissionIndex.set(key, created.id);
          if (autoApproveAll) {
            await this.decidePermission(created.id, 'allow_session');
          }
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`failed to create codex permission request: ${message}`);
        });
    };

    stdoutLines.on('line', (line) => {
      const rawLine = line.trim();
      this.happyEventLogger.logRaw({
        sessionId: session.id,
        ...(chatId ? { chatId } : {}),
        channel: 'exec_cli',
        line: rawLine,
      });
      const payload = parseJsonLine(rawLine);
      if (!payload) {
        this.happyEventLogger.logParsed({
          sessionId: session.id,
          ...(chatId ? { chatId } : {}),
          channel: 'exec_cli',
          stage: 'incoming_payload',
          payload: { parseError: 'invalid_json' },
        });
        return;
      }
      this.happyEventLogger.logParsed({
        sessionId: session.id,
        ...(chatId ? { chatId } : {}),
        channel: 'exec_cli',
        stage: 'incoming_payload',
        payload,
      });

      if (payload.type === 'thread.started') {
        const startedThreadId = asString(payload.thread_id, '').trim();
        if (startedThreadId) {
          resolvedThreadId = startedThreadId;
          this.codexThreads.set(threadCacheKey, startedThreadId);
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
        const text = asString(item.text, '').trim();
        if (text) {
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
        if (fileWrite.status && fileWrite.status !== 'completed' && fileWrite.status !== 'inProgress') {
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

    const finalText = lastAgentMessage.trim();
    if (signal?.aborted) {
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
      throw new Error(`codex CLI failed: ${detail}`);
    }

    return {
      output: trimOutput(finalText),
      cwd: safeCwd,
      streamedPersisted,
      agentMessagePersisted,
      threadId: resolvedThreadId || undefined,
    };
  }

  private async resolveCodexThreadId(sessionId: string, chatId?: string): Promise<string | undefined> {
    const cacheKey = buildCodexThreadCacheKey(sessionId, chatId);
    const cached = this.codexThreads.get(cacheKey);
    if (cached) {
      return cached;
    }

    try {
      const history = await this.listMessages(sessionId);
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
        this.codexThreads.set(cacheKey, trimmed);
        return trimmed;
      }
    } catch {
      // Ignore thread recovery failures and start a new Codex thread.
    }

    return undefined;
  }

  private async generateAndPersistAgentReply(
    session: RuntimeSession,
    prompt: string,
    context: { chatId?: string; threadId?: string; agent?: RuntimeAgent; model?: string } = {},
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
    const selectedModel = normalizeModel(context.model) ?? normalizeModel(session.metadata.model);
    const runKey = this.buildRunKey(session.id, scopedChatId);
    const controller = new AbortController();
    const existing = this.activeRuns.get(runKey);
    if (existing && !existing.signal.aborted) {
      existing.abort();
    }
    this.activeRuns.set(runKey, controller);

    try {
      const isCodex = flavor === 'codex';
      const preferredThreadId = typeof context.threadId === 'string' && context.threadId.trim().length > 0
        ? context.threadId.trim()
        : undefined;
      const threadCacheKey = buildCodexThreadCacheKey(session.id, scopedChatId);
      let response: {
        output: string;
        cwd: string;
        streamedPersisted?: boolean;
        agentMessagePersisted?: boolean;
        threadId?: string;
        inferredActions?: ParsedAgentActionEvent[];
      };

      if (isCodex) {
        const recoveredThreadId = preferredThreadId ?? await this.resolveCodexThreadId(session.id, scopedChatId);
        try {
          response = await this.runCodexCliWithEvents(
            session,
            prompt,
            controller.signal,
            recoveredThreadId,
            scopedChatId,
            selectedModel,
          );
        } catch (error) {
          if (!recoveredThreadId || !isMissingCodexThreadError(error)) {
            throw error;
          }

          // Stored thread id became invalid; clear and start a fresh Codex thread.
          this.codexThreads.delete(threadCacheKey);
          response = await this.runCodexCliWithEvents(session, prompt, controller.signal, undefined, scopedChatId, selectedModel);
        }
      } else {
        const nonCodex = await this.runAgentCli(
          flavor,
          prompt,
          session.metadata.approvalPolicy,
          selectedModel,
          session.metadata.path,
          controller.signal,
        );
        response = {
          output: nonCodex.output,
          cwd: nonCodex.cwd,
          streamedPersisted: false,
          agentMessagePersisted: false,
          inferredActions: nonCodex.inferredActions,
        };
      }

      if (isCodex && response.threadId) {
        this.codexThreads.set(threadCacheKey, response.threadId);
      }

      if (!isCodex && Array.isArray(response.inferredActions) && response.inferredActions.length > 0) {
        for (const action of response.inferredActions.slice(0, 10)) {
          const outputPreview = action.output ? trimOutput(action.output) : '';
          const bodyParts = [
            action.command ? `$ ${action.command}` : '',
            action.path ? `path: ${action.path}` : '',
            outputPreview,
          ].filter(Boolean);
          const body = bodyParts.join('\n').trim();
          if (!body) {
            continue;
          }

          await this.appendAgentMessage(session.id, body, {
            ...(scopedChatId ? { chatId: scopedChatId } : {}),
            requestedPath: session.metadata.path,
            execCwd: response.cwd,
            actionType: action.actionType,
            normalizedActionKind: action.actionType,
            command: action.command,
            path: action.path,
            additions: action.additions,
            deletions: action.deletions,
            hasDiffSignal: action.hasDiffSignal,
            streamEvent: 'agent_stream_action',
            agent: flavor,
          }, {
            type: 'tool',
            title: action.title,
          });
        }
      }

      const streamedPersisted = Boolean(response.streamedPersisted);
      const agentMessagePersisted = Boolean(response.agentMessagePersisted);
      if (!isCodex || !streamedPersisted || (!agentMessagePersisted && response.output.trim().length > 0)) {
        await this.appendAgentMessage(session.id, response.output, {
          ...(scopedChatId ? { chatId: scopedChatId } : {}),
          requestedPath: session.metadata.path,
          execCwd: response.cwd,
          agent: flavor,
          ...(response.threadId ? { threadId: response.threadId } : {}),
        });
      }
    } catch (error) {
      const scopedChatId = typeof context.chatId === 'string' && context.chatId.trim().length > 0
        ? context.chatId.trim()
        : undefined;
      if (flavor === 'codex' && isMissingCodexThreadError(error)) {
        this.codexThreads.delete(buildCodexThreadCacheKey(session.id, scopedChatId));
      }
      if (isAbortFailure(error) || controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown runtime error';
      try {
        await this.appendAgentMessage(session.id, `에이전트 실행 오류: ${message}`, {
          ...(scopedChatId ? { chatId: scopedChatId } : {}),
          requestedPath: session.metadata.path,
          error: true,
        });
      } catch (persistError) {
        const persistMessage = persistError instanceof Error ? persistError.message : 'Unknown persist error';
        console.error(`failed to persist agent error message: ${persistMessage}`);
      }
    } finally {
      const current = this.activeRuns.get(runKey);
      if (current === controller) {
        this.activeRuns.delete(runKey);
      }
    }
  }

  async listSessions(): Promise<RuntimeSession[]> {
    const raw = await this.request<HappyListSessionsResponse>('/v1/sessions');
    const list = Array.isArray(raw.sessions) ? raw.sessions : [];
    return list
      .map((item) => (asRecord(item) ? (item as unknown as HappyBackendSession) : null))
      .filter((item): item is HappyBackendSession => item !== null && typeof item.id === 'string')
      .map(toRuntimeSession)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSession(sessionId: string): Promise<RuntimeSession | null> {
    const sessions = await this.listSessions();
    return sessions.find((session) => session.id === sessionId) ?? null;
  }

  async createSession(input: HappyRuntimeCreateInput): Promise<RuntimeSession> {
    const approvalPolicy = normalizeApprovalPolicy(input.approvalPolicy, DEFAULT_APPROVAL_POLICY);
    const model = normalizeModel(input.model);
    const metadata = JSON.stringify({
      flavor: input.flavor,
      path: input.path,
      approvalPolicy,
      ...(model ? { model } : {}),
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
    return toRuntimeSession(mapped);
  }

  async listMessages(
    sessionId: string,
    options: { afterSeq?: number; limit?: number } = {},
  ): Promise<RuntimeMessage[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const hasPaginatedRequest = options.afterSeq !== undefined || options.limit !== undefined;
    if (hasPaginatedRequest) {
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
      void this.generateAndPersistAgentReply(session, input.text, {
        chatId,
        threadId,
        ...(requestedAgent !== 'unknown' ? { agent: requestedAgent } : {}),
        ...(requestedModel ? { model: requestedModel } : {}),
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

  async applySessionAction(sessionId: string, action: SessionAction): Promise<{ accepted: boolean; message: string; at: string }> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    if (action === 'abort' || action === 'kill') {
      this.abortSessionRuns(sessionId);
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
    if (chatId && chatId.trim().length > 0) {
      return this.activeRuns.has(this.buildRunKey(sessionId, chatId));
    }
    for (const runKey of this.activeRuns.keys()) {
      if (this.isSessionRunKey(runKey, sessionId)) {
        return true;
      }
    }
    return false;
  }

  async listPermissions(state?: PermissionState): Promise<PermissionRequest[]> {
    const list = [...this.permissions.values()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return state ? list.filter((permission) => permission.state === state) : list;
  }

  async createPermission(input: HappyRuntimePermissionInput): Promise<PermissionRequest> {
    const session = await this.getSession(input.sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const permission: PermissionRequest = {
      id: randomUUID(),
      sessionId: input.sessionId,
      agent: input.agent,
      command: input.command,
      reason: input.reason,
      risk: input.risk,
      requestedAt: new Date().toISOString(),
      state: 'pending',
    };

    this.permissions.set(permission.id, permission);
    return permission;
  }

  async decidePermission(permissionId: string, decision: PermissionDecision): Promise<PermissionRequest> {
    const permission = this.permissions.get(permissionId);
    if (!permission) {
      throw new Error('PERMISSION_NOT_FOUND');
    }

    const state: PermissionState = decision === 'deny' ? 'denied' : 'approved';
    const updated = { ...permission, state };
    this.permissions.set(permissionId, updated);

    for (const [key, mappedPermissionId] of this.codexPermissionIndex.entries()) {
      if (mappedPermissionId === permissionId) {
        this.codexPermissionIndex.delete(key);
      }
    }

    const responder = this.codexPermissionResponders.get(permissionId);
    this.codexPermissionResponders.delete(permissionId);

    if (responder) {
      try {
        await responder(decision);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`failed to send codex permission decision: ${message}`);
        if (decision === 'deny') {
          this.abortSessionRuns(permission.sessionId);
        }
      }
    } else if (decision === 'deny') {
      this.abortSessionRuns(permission.sessionId);
    }

    return updated;
  }
}
