import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import * as path from 'node:path';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';
import type {
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
const CODEX_APPROVAL_POLICY = (process.env.CODEX_APPROVAL_POLICY || 'on-request').trim();
const CODEX_SANDBOX_MODE = (process.env.CODEX_SANDBOX_MODE || 'workspace-write').trim();

type RuntimeAgent = RuntimeSession['metadata']['flavor'];
type PermissionState = PermissionRequest['state'];
type SessionStatusValue = RuntimeSession['state']['status'];
type PermissionActionType = 'exec' | 'patch';

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

function normalizeMetadata(raw: unknown): { flavor: RuntimeAgent; path: string; status?: string } {
  if (!raw) {
    return { flavor: 'unknown', path: 'unknown-project' };
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
    meta: parsed.meta || role
      ? { ...(parsed.meta ?? {}), ...(role ? { role } : {}) }
      : undefined,
  };
}

function toRuntimeSession(raw: HappyBackendSession): RuntimeSession {
  const metadata = normalizeMetadata(raw.metadata);
  return {
    id: raw.id,
    metadata: {
      flavor: metadata.flavor,
      path: metadata.path,
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

type AgentCommand = { command: string; args: string[]; requiresPty?: boolean };

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

function parseJsonLine(line: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(line);
    return asRecord(parsed);
  } catch {
    return null;
  }
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
  const trimmed = command.trim();
  const shellPrefix = "/bin/bash -lc '";
  if (trimmed.startsWith(shellPrefix) && trimmed.endsWith("'")) {
    return trimmed.slice(shellPrefix.length, -1);
  }
  return trimmed;
}

function inferActionTypeFromCommand(command: string): 'command_execution' | 'file_list' | 'file_read' | 'file_write' {
  const normalized = command.toLowerCase();
  if (
    normalized.includes('rg --files') ||
    normalized.includes(' ls ') ||
    normalized.startsWith('ls ') ||
    normalized.includes(' find ') ||
    normalized.startsWith('find ') ||
    normalized.includes(' tree ') ||
    normalized.startsWith('tree ')
  ) {
    return 'file_list';
  }
  if (
    normalized.includes(' cat ') ||
    normalized.startsWith('cat ') ||
    normalized.includes(' sed ') ||
    normalized.startsWith('sed ') ||
    normalized.includes(' head ') ||
    normalized.startsWith('head ') ||
    normalized.includes(' tail ') ||
    normalized.startsWith('tail ')
  ) {
    return 'file_read';
  }
  if (
    normalized.includes('apply_patch') ||
    normalized.includes(' tee ') ||
    normalized.includes(' > ') ||
    normalized.includes('>>') ||
    normalized.includes(' perl -pi') ||
    normalized.includes(' sed -i')
  ) {
    return 'file_write';
  }
  return 'command_execution';
}

function titleForActionType(actionType: 'command_execution' | 'file_list' | 'file_read' | 'file_write'): string {
  if (actionType === 'file_list') {
    return 'File Listing';
  }
  if (actionType === 'file_read') {
    return 'File Read';
  }
  if (actionType === 'file_write') {
    return 'File Write';
  }
  return 'Command Execution';
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

function buildAgentCommand(agent: RuntimeAgent, prompt: string): AgentCommand | null {
  if (agent === 'claude') {
    return { command: 'claude', args: ['--dangerously-skip-permissions', '--print', prompt], requiresPty: true };
  }
  if (agent === 'gemini') {
    return { command: 'gemini', args: ['-p', prompt] };
  }
  return null;
}

export class HappyRuntimeStore {
  private readonly permissions = new Map<string, PermissionRequest>();
  private readonly activeRuns = new Map<string, AbortController>();
  private readonly codexThreads = new Map<string, string>();
  private readonly codexPermissionIndex = new Map<string, string>();

  private readonly serverUrl: string;
  private readonly serverToken: string;
  private readonly workspaceRoot: string;
  private readonly hostProjectsRoot: string;

  constructor(opts: { serverUrl: string; token: string; workspaceRoot?: string; hostProjectsRoot?: string }) {
    this.serverUrl = opts.serverUrl.replace(/\/+$/, '');
    this.serverToken = opts.token;
    this.workspaceRoot = (opts.workspaceRoot || '/workspace').replace(/\/+$/, '');
    this.hostProjectsRoot = (opts.hostProjectsRoot || '').replace(/\/+$/, '');
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    if (!this.serverToken) {
      throw new Error('HAPPY_SERVER_TOKEN is required to connect to happy runtime');
    }

    const response = await fetch(`${this.serverUrl}${path}`, {
      ...init,
      headers: {
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

  private mapHappyResponse(response: HappySessionResponse): HappyBackendSession[] {
    if (Array.isArray(response.sessions)) {
      return response.sessions as HappyBackendSession[];
    }
    if (response.session) {
      return [response.session];
    }
    return [];
  }

  private resolveExecutionCwd(cwdHint?: string): string {
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
    cwdHint?: string,
    signal?: AbortSignal,
  ): Promise<{ output: string; cwd: string }> {
    const command = buildAgentCommand(agent, prompt);
    if (!command) {
      throw new Error(`Unsupported agent flavor: ${agent}`);
    }

    const safeCwd = this.resolveExecutionCwd(cwdHint);
    const mergedPath = `${process.env.PATH || ''}:${AGENT_EXTRA_PATHS}`;

    let result: { stdout: string; stderr: string };
    try {
      result = command.requiresPty
        ? await execFileAsync(
          'script',
          ['-q', '-c', `${shellEscapeSingle(command.command)} ${command.args.map(shellEscapeSingle).join(' ')}`, '/dev/null'],
          {
            cwd: safeCwd,
            timeout: AGENT_COMMAND_TIMEOUT_MS,
            maxBuffer: 8 * 1024 * 1024,
            env: { ...process.env, PATH: mergedPath },
            signal,
          },
        )
        : await execFileAsync(command.command, command.args, {
          cwd: safeCwd,
          timeout: AGENT_COMMAND_TIMEOUT_MS,
          maxBuffer: 8 * 1024 * 1024,
          env: { ...process.env, PATH: mergedPath },
          signal,
        });
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
    const output = trimOutput(cleanedStdout || cleanedStderr || '');
    if (!output) {
      throw new Error(`${agent} returned an empty response`);
    }
    return { output, cwd: safeCwd };
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
  ): Promise<{ output: string; cwd: string; streamedPersisted: boolean; threadId?: string }> {
    const safeCwd = this.resolveExecutionCwd(session.metadata.path);
    const mergedPath = `${process.env.PATH || ''}:${AGENT_EXTRA_PATHS}`;
    const execArgs = threadId
      ? ['exec', 'resume', threadId, '--json', prompt]
      : ['exec', '--json', prompt];
    const args = ['-a', CODEX_APPROVAL_POLICY, '-s', CODEX_SANDBOX_MODE, ...execArgs];
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
    let resolvedThreadId = typeof threadId === 'string' && threadId.trim().length > 0
      ? threadId.trim()
      : '';

    const enqueueAppend = (
      text: string,
      meta: Record<string, unknown>,
      options: { type?: string; title?: string } = {},
    ) => {
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
        })
        .catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`failed to create codex permission request: ${message}`);
        });
    };

    stdoutLines.on('line', (line) => {
      const payload = parseJsonLine(line.trim());
      if (!payload) {
        return;
      }

      if (payload.type === 'thread.started') {
        const startedThreadId = asString(payload.thread_id, '').trim();
        if (startedThreadId) {
          resolvedThreadId = startedThreadId;
          this.codexThreads.set(session.id, startedThreadId);
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
          enqueueAppend(
            text,
            {
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
          requestedPath: session.metadata.path,
          execCwd: safeCwd,
          actionType,
          command,
          exitCode: exitCode ?? undefined,
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
      threadId: resolvedThreadId || undefined,
    };
  }

  private async resolveCodexThreadId(sessionId: string): Promise<string | undefined> {
    const cached = this.codexThreads.get(sessionId);
    if (cached) {
      return cached;
    }

    try {
      const history = await this.listMessages(sessionId);
      for (let index = history.length - 1; index >= 0; index -= 1) {
        const candidate = history[index]?.meta?.threadId;
        if (typeof candidate !== 'string') {
          continue;
        }
        const trimmed = candidate.trim();
        if (!trimmed) {
          continue;
        }
        this.codexThreads.set(sessionId, trimmed);
        return trimmed;
      }
    } catch {
      // Ignore thread recovery failures and start a new Codex thread.
    }

    return undefined;
  }

  private async generateAndPersistAgentReply(session: RuntimeSession, prompt: string): Promise<void> {
    const flavor = session.metadata.flavor;
    if (flavor === 'unknown') {
      return;
    }

    const controller = new AbortController();
    this.activeRuns.set(session.id, controller);

    try {
      const isCodex = flavor === 'codex';
      let response: { output: string; cwd: string; streamedPersisted?: boolean; threadId?: string };

      if (isCodex) {
        const recoveredThreadId = await this.resolveCodexThreadId(session.id);
        try {
          response = await this.runCodexCliWithEvents(session, prompt, controller.signal, recoveredThreadId);
        } catch (error) {
          if (!recoveredThreadId || !isMissingCodexThreadError(error)) {
            throw error;
          }

          // Stored thread id became invalid; clear and start a fresh Codex thread.
          this.codexThreads.delete(session.id);
          response = await this.runCodexCliWithEvents(session, prompt, controller.signal);
        }
      } else {
        const nonCodex = await this.runAgentCli(flavor, prompt, session.metadata.path, controller.signal);
        response = {
          output: nonCodex.output,
          cwd: nonCodex.cwd,
          streamedPersisted: false,
        };
      }

      if (isCodex && response.threadId) {
        this.codexThreads.set(session.id, response.threadId);
      }

      const streamedPersisted = Boolean(response.streamedPersisted);
      if (!isCodex || !streamedPersisted) {
        await this.appendAgentMessage(session.id, response.output, {
          requestedPath: session.metadata.path,
          execCwd: response.cwd,
          ...(response.threadId ? { threadId: response.threadId } : {}),
        });
      }
    } catch (error) {
      if (flavor === 'codex' && isMissingCodexThreadError(error)) {
        this.codexThreads.delete(session.id);
      }
      if (isAbortFailure(error) || controller.signal.aborted) {
        return;
      }
      const message = error instanceof Error ? error.message : 'Unknown runtime error';
      try {
        await this.appendAgentMessage(session.id, `에이전트 실행 오류: ${message}`, {
          requestedPath: session.metadata.path,
          error: true,
        });
      } catch (persistError) {
        const persistMessage = persistError instanceof Error ? persistError.message : 'Unknown persist error';
        console.error(`failed to persist agent error message: ${persistMessage}`);
      }
    } finally {
      const current = this.activeRuns.get(session.id);
      if (current === controller) {
        this.activeRuns.delete(session.id);
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
    const metadata = JSON.stringify({
      flavor: input.flavor,
      path: input.path,
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

  async listMessages(sessionId: string): Promise<RuntimeMessage[]> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const response = await this.request<HappyMessageResponse>(`/v3/sessions/${encodeURIComponent(sessionId)}/messages`);
    return response.messages
      .filter((message) => typeof message.id === 'string')
      .map((message) => toRuntimeMessage(sessionId, message))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
      void this.generateAndPersistAgentReply(session, input.text);
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
      const active = this.activeRuns.get(sessionId);
      if (active && !active.signal.aborted) {
        active.abort();
      }
      this.activeRuns.delete(sessionId);
    }

    if (action === 'kill') {
      this.codexThreads.delete(sessionId);
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

    if (decision === 'deny') {
      const active = this.activeRuns.get(permission.sessionId);
      if (active && !active.signal.aborted) {
        active.abort();
      }
    }

    try {
      await this.appendAgentMessage(
        permission.sessionId,
        `Permission ${permission.command} -> ${state}`,
        { permissionId, decision, source: 'permission-decision' },
        { type: 'tool', title: 'Permission Decision' },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`failed to persist permission decision message: ${message}`);
    }

    return updated;
  }
}
