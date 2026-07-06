import { randomUUID } from 'node:crypto';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import type {
  ApprovalPolicy,
  GeminiSessionCapabilities,
  PermissionDecision,
  PermissionRequest,
  PermissionRisk,
  RuntimeMessage,
  RuntimeSession,
  SessionAction,
  SessionStatus,
} from './types.js';
import { RuntimeCore } from './runtime/runtimeCore.js';
import { PrismaRuntimeStore } from './runtime/prismaStore.js';
import { computeWorktreePath, ensureWorktree, removeWorktree } from './runtime/worktreeManager.js';
import type { ImportedAgentProvider, ImportedProviderMessage } from './runtime/import/providerSessionImportParsers.js';

type RuntimeBackend = 'mock' | 'prisma';
const execAsync = promisify(exec);
const TERMINAL_COMMAND_TIMEOUT_MS = 30_000;
const TERMINAL_COMMAND_MAX_BUFFER = 1024 * 1024;
const TERMINAL_OUTPUT_MAX_CHARS = 12_000;

type CreateSessionInput = {
  path: string;
  flavor: RuntimeSession['metadata']['flavor'];
  approvalPolicy?: ApprovalPolicy;
  model?: string;
  status?: SessionStatus;
  riskScore?: number;
  branch?: string;
};

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

type AppendMessageInput = {
  type: string;
  title?: string;
  text: string;
  meta?: Record<string, unknown>;
};

type AppendChatEventInput = {
  sessionId: string;
  runtimeSessionId?: string;
  runId?: string;
  type: string;
  title?: string;
  text: string;
  meta?: Record<string, unknown>;
};

type RunTerminalCommandInput = {
  sessionId: string;
  runtimeSessionId?: string;
  command: string;
};

function asUserPromptInput(input: AppendMessageInput): AppendMessageInput {
  return {
    ...input,
    type: 'message',
    meta: {
      ...(input.meta ?? {}),
      actor: 'user',
      kind: 'user_message',
      role: 'user',
    },
  };
}

function asChatUserPromptInput(chatId: string, input: AppendChatEventInput): AppendChatEventInput {
  return {
    ...input,
    type: 'message',
    meta: {
      ...(input.meta ?? {}),
      chatId,
      actor: 'user',
      kind: 'user_message',
      role: 'user',
    },
  };
}

function trimTerminalOutput(value: string): string {
  if (value.length <= TERMINAL_OUTPUT_MAX_CHARS) {
    return value;
  }
  return `${value.slice(0, TERMINAL_OUTPUT_MAX_CHARS)}\n\n[output truncated at ${TERMINAL_OUTPUT_MAX_CHARS} chars]`;
}

type CreatePermissionInput = {
  sessionId: string;
  chatId?: string | null;
  agent: PermissionRequest['agent'];
  command: string;
  reason: string;
  risk: PermissionRisk;
};

export type RuntimeRealtimeChannelEvent =
  | {
      type: 'event.appended';
      sessionId: string;
      chatId?: string;
      event: RuntimeMessage;
      cursor?: number;
      source: 'mutation' | 'runtime';
    }
  | {
      type: 'session.created' | 'session.updated' | 'session.action';
      sessionId: string;
      chatId?: string;
      session?: RuntimeSession;
      action?: SessionAction;
    }
  | {
      type: 'permission.created' | 'permission.updated';
      sessionId: string;
      chatId?: string;
      permission: PermissionRequest;
    };

export type RuntimeRealtimeChannelFilter = {
  sessionId: string;
  chatId?: string;
  includeUnassigned?: boolean;
};

export type RuntimeRealtimeChannelListener = (event: RuntimeRealtimeChannelEvent) => void;

interface RuntimeStoreBackend {
  listSessions(): Promise<RuntimeSession[]>;
  getSession(sessionId: string): Promise<RuntimeSession | null>;
  getGeminiSessionCapabilities?(sessionId: string): Promise<GeminiSessionCapabilities>;
  createSession(input: CreateSessionInput): Promise<RuntimeSession>;
  updateApprovalPolicy?(sessionId: string, approvalPolicy: ApprovalPolicy): Promise<RuntimeSession>;
  listMessages(sessionId: string, options?: { afterSeq?: number; afterId?: string; limit?: number }): Promise<RuntimeMessage[]>;
  listChatEvents?(chatId: string, options?: { afterSeq?: number; limit?: number }): Promise<RuntimeMessage[]>;
  listRealtimeEvents?(sessionId: string, options?: { afterCursor?: number; limit?: number; chatId?: string }): Promise<{ events: RuntimeMessage[]; cursor: number }>;
  appendMessage(sessionId: string, input: AppendMessageInput): Promise<RuntimeMessage>;
  appendChatEvent?(chatId: string, input: AppendChatEventInput): Promise<RuntimeMessage>;
  discoverImportedAgentSession?(input: {
    provider: ImportedAgentProvider;
    providerSessionId: string;
    sourcePath: string;
    projectPath: string;
    fileSize?: bigint;
    fileMtimeMs?: bigint;
    oldestCursorOffset?: bigint | null;
    newestCursorOffset?: bigint | null;
    status?: string;
  }): Promise<{ id: string; chatId?: string | null }>;
  ensureImportedAgentChat?(input: {
    importId: string;
    arisSessionId: string;
    userId: string;
    title: string;
  }): Promise<{ chatId: string }>;
  appendImportedAgentEvents?(input: {
    importId: string;
    provider: ImportedAgentProvider;
    providerSessionId: string;
    sessionId: string;
    chatId: string;
    messages: ImportedProviderMessage[];
  }): Promise<Array<{ id: string }>>;
  getImportedAgentSessionState?(chatId: string): Promise<{ hasMoreBefore: boolean } | null>;
  loadOlderImportedAgentEvents?(input: { chatId: string; limitTurns: number }): Promise<{ events: RuntimeMessage[]; hasMoreBefore: boolean }>;
  getLatestUserMessageForAction?(sessionId: string, chatId?: string): Promise<AppendMessageInput | null>;
  applySessionAction(sessionId: string, action: SessionAction, chatId?: string): Promise<{ accepted: boolean; message: string; at: string }>;
  isSessionRunning(sessionId: string, chatId?: string): Promise<boolean>;
  listPermissions(state?: PermissionRequest['state']): Promise<PermissionRequest[]>;
  createPermission(input: CreatePermissionInput): Promise<PermissionRequest>;
  decidePermission(permissionId: string, decision: PermissionDecision): Promise<PermissionRequest>;
}

type RuntimeExecutor = Pick<
  RuntimeCore,
  | 'triggerPersistedUserMessage'
  | 'listRealtimeEvents'
  | 'applySessionAction'
  | 'isSessionRunning'
  | 'listPermissions'
  | 'createPermission'
  | 'decidePermission'
  | 'getGeminiSessionCapabilities'
  | 'subscribeRealtimeEvents'
  | 'beginShutdownDrain'
  | 'awaitDrain'
>;

class MockRuntimeStore implements RuntimeStoreBackend {
  private readonly sessions = new Map<string, RuntimeSession>();
  private readonly messages = new Map<string, RuntimeMessage[]>();
  private readonly chatEvents = new Map<string, RuntimeMessage[]>();
  private readonly permissions = new Map<string, PermissionRequest>();
  private readonly pendingAgentReplies = new Map<string, NodeJS.Timeout>();

  constructor(defaultProjectPath: string) {
    // Keep store intentionally empty on startup.
    // Sessions, messages, and permissions should be created only by real user actions or runtime events.
    void defaultProjectPath;
  }

  async listSessions(): Promise<RuntimeSession[]> {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  async getSession(sessionId: string): Promise<RuntimeSession | null> {
    return this.sessions.get(sessionId) ?? null;
  }

  async getGeminiSessionCapabilities(sessionId: string): Promise<GeminiSessionCapabilities> {
    const session = await this.getSession(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }
    return {
      sessionId,
      fetchedAt: new Date().toISOString(),
      modes: {
        currentModeId: session.metadata.approvalPolicy === 'yolo' ? 'yolo' : 'default',
        availableModes: [
          { id: 'default', label: 'Default' },
          { id: 'yolo', label: 'YOLO' },
        ],
      },
      models: {
        currentModelId: session.metadata.model ?? null,
        availableModels: session.metadata.model
          ? [{ id: session.metadata.model, label: session.metadata.model }]
          : [],
      },
    };
  }

  async createSession(input: CreateSessionInput): Promise<RuntimeSession> {
    const now = new Date().toISOString();
    const model = normalizeModel(input.model);
    const session: RuntimeSession = {
      id: randomUUID(),
      metadata: {
        flavor: input.flavor,
        path: input.path,
        approvalPolicy: input.approvalPolicy ?? 'on-request',
        ...(model ? { model } : {}),
        ...(input.branch ? { branch: input.branch } : {}),
        runtimeModel: 'chat-stream',
      },
      state: {
        status: input.status ?? 'idle',
      },
      updatedAt: now,
      riskScore: input.riskScore ?? 20,
    };

    this.sessions.set(session.id, session);
    this.messages.set(session.id, []);
    return session;
  }

  async updateApprovalPolicy(sessionId: string, approvalPolicy: ApprovalPolicy): Promise<RuntimeSession> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }
    session.metadata.approvalPolicy = approvalPolicy;
    session.updatedAt = new Date().toISOString();
    return session;
  }

  async listMessages(sessionId: string, options: { afterSeq?: number; afterId?: string; limit?: number } = {}): Promise<RuntimeMessage[]> {
    const base = this.messages.get(sessionId) ?? [];
    const sorted = [...base].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const withSeq = sorted.map((message, index) => ({
      ...message,
      meta: {
        ...(message.meta ?? {}),
        seq: index + 1,
      },
    }));

    // afterId: find the index of that message and slice everything after it
    if (typeof options.afterId === 'string' && options.afterId) {
      const idx = withSeq.findIndex((m) => m.id === options.afterId);
      const afterIdFiltered = idx >= 0 ? withSeq.slice(idx + 1) : withSeq;
      const normalizedLimit = Number.isFinite(options.limit)
        ? Math.max(1, Math.floor(Number(options.limit)))
        : null;
      return normalizedLimit === null ? afterIdFiltered : afterIdFiltered.slice(0, normalizedLimit);
    }

    const normalizedAfterSeq = Number.isFinite(options.afterSeq)
      ? Math.max(0, Math.floor(Number(options.afterSeq)))
      : 0;
    const afterFiltered = withSeq.filter((message) => {
      const seqValue = Number((message.meta as { seq?: number }).seq);
      return Number.isFinite(seqValue) ? seqValue > normalizedAfterSeq : true;
    });
    const normalizedLimit = Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(Number(options.limit)))
      : null;
    if (normalizedLimit === null) {
      return afterFiltered;
    }
    return afterFiltered.slice(0, normalizedLimit);
  }

  async listChatEvents(chatId: string, options: { afterSeq?: number; limit?: number } = {}): Promise<RuntimeMessage[]> {
    const base = this.chatEvents.get(chatId) ?? [];
    const afterSeq = Number.isFinite(options.afterSeq) ? Math.max(0, Math.floor(Number(options.afterSeq))) : 0;
    const filtered = base.filter((message) => {
      const seqRaw = (message.meta as { seq?: unknown } | undefined)?.seq;
      const seq = typeof seqRaw === 'number' ? seqRaw : Number.parseInt(String(seqRaw ?? ''), 10);
      return Number.isFinite(seq) ? seq > afterSeq : true;
    });
    const normalizedLimit = Number.isFinite(options.limit)
      ? Math.max(1, Math.floor(Number(options.limit)))
      : null;
    return normalizedLimit === null ? filtered : filtered.slice(0, normalizedLimit);
  }

  async appendMessage(sessionId: string, input: AppendMessageInput): Promise<RuntimeMessage> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const isAgentMessage = input.meta?.role === 'agent';
    const isUserPrompt = input.type === 'message' && !isAgentMessage;
    if (isUserPrompt) {
      session.state.status = 'running';
    }
    if (isAgentMessage) {
      session.state.status = 'idle';
    }

    const message: RuntimeMessage = {
      id: randomUUID(),
      sessionId,
      type: input.type,
      title: input.title ?? input.type,
      text: input.text,
      meta: input.meta,
      createdAt: new Date().toISOString(),
    };

    const list = this.messages.get(sessionId) ?? [];
    list.push(message);
    this.messages.set(sessionId, list);

    session.updatedAt = message.createdAt;
    this.sessions.set(sessionId, session);

    // Mock Agent Response Logic
    if (isUserPrompt) {
      const existingTimer = this.pendingAgentReplies.get(sessionId);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }

      const timer = setTimeout(() => {
        this.pendingAgentReplies.delete(sessionId);
        void this.appendMessage(sessionId, {
          type: 'message',
          title: 'Text Reply',
          text: `[${session.metadata.flavor}] I received your message: "${input.text}". How can I help you with the code in ${session.metadata.path}?`,
          meta: { role: 'agent' },
        });
      }, 1500);
      this.pendingAgentReplies.set(sessionId, timer);
    }

    return message;
  }

  async appendChatEvent(
    chatId: string,
    input: { sessionId: string; runId?: string; type: string; title?: string; text: string; meta?: Record<string, unknown> },
  ): Promise<RuntimeMessage> {
    const session = this.sessions.get(input.sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const list = this.chatEvents.get(chatId) ?? [];
    const seq = list.length + 1;
    const message: RuntimeMessage = {
      id: randomUUID(),
      sessionId: input.sessionId,
      type: input.type,
      title: input.title ?? input.type,
      text: input.text,
      createdAt: new Date().toISOString(),
      meta: {
        ...(input.meta ?? {}),
        chatId,
        ...(input.runId ? { runId: input.runId } : {}),
        seq,
      },
    };
    list.push(message);
    this.chatEvents.set(chatId, list);
    session.updatedAt = message.createdAt;
    this.sessions.set(input.sessionId, session);
    return message;
  }

  async getLatestUserMessageForAction(sessionId: string, chatId?: string): Promise<AppendMessageInput | null> {
    if (chatId && chatId.trim().length > 0) {
      const events = this.chatEvents.get(chatId.trim()) ?? [];
      for (let index = events.length - 1; index >= 0; index -= 1) {
        const event = events[index];
        const role = typeof event.meta?.role === 'string' ? event.meta.role.trim() : '';
        if (event.sessionId === sessionId && role === 'user') {
          return {
            type: event.type,
            title: event.title,
            text: event.text,
            meta: event.meta,
          };
        }
      }
      return null;
    }

    const messages = this.messages.get(sessionId) ?? [];
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      const message = messages[index];
      const role = typeof message.meta?.role === 'string' ? message.meta.role.trim() : '';
      if (role === 'user') {
        return {
          type: message.type,
          title: message.title,
          text: message.text,
          meta: message.meta,
        };
      }
    }
    return null;
  }

  async applySessionAction(sessionId: string, action: SessionAction, _chatId?: string): Promise<{ accepted: boolean; message: string; at: string }> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const at = new Date().toISOString();
    const statusByAction: Record<Exclude<SessionAction, 'kill'>, SessionStatus> = {
      abort: 'idle',
      retry: 'running',
      resume: 'running',
    };

    if (action !== 'kill') {
      session.state.status = statusByAction[action];
      session.updatedAt = at;
    }

    if (action === 'retry' || action === 'resume') {
      session.riskScore = Math.max(10, session.riskScore - 15);
    }

    if (action === 'abort' || action === 'kill') {
      const pendingReply = this.pendingAgentReplies.get(sessionId);
      if (pendingReply) {
        clearTimeout(pendingReply);
        this.pendingAgentReplies.delete(sessionId);
      }
    }

    if (action === 'kill') {
      this.sessions.delete(sessionId);
      this.messages.delete(sessionId);
      for (const [permissionId, permission] of this.permissions.entries()) {
        if (permission.sessionId === sessionId) {
          this.permissions.delete(permissionId);
        }
      }
    } else {
      this.sessions.set(sessionId, session);
      await this.appendMessage(sessionId, {
        type: 'tool',
        title: 'Command Execution',
        text: `$ session ${action}\nexit code: 0`,
        meta: { system: true, action },
      });
    }

    return {
      accepted: true,
      message: `${action.toUpperCase()} acknowledged`,
      at,
    };
  }

  async isSessionRunning(sessionId: string, _chatId?: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    return session.state.status === 'running';
  }

  async listPermissions(state?: PermissionRequest['state']): Promise<PermissionRequest[]> {
    const list = [...this.permissions.values()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return state ? list.filter((item) => item.state === state) : list;
  }

  async createPermission(input: CreatePermissionInput): Promise<PermissionRequest> {
    if (!this.sessions.has(input.sessionId)) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const permission: PermissionRequest = {
      id: randomUUID(),
      sessionId: input.sessionId,
      ...(typeof input.chatId === 'string' && input.chatId.trim().length > 0
        ? { chatId: input.chatId.trim() }
        : {}),
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

    permission.state = decision === 'deny' ? 'denied' : 'approved';
    this.permissions.set(permission.id, permission);

    return permission;
  }
}

export class RuntimeStore {
  private readonly delegate: RuntimeStoreBackend;
  private readonly runtimeExecutor: RuntimeExecutor | null;
  private readonly realtimeSubscribers = new Set<{
    filter: RuntimeRealtimeChannelFilter;
    listener: RuntimeRealtimeChannelListener;
  }>();

  constructor(
    defaultProjectPath: string,
    runtimeBackend: RuntimeBackend = 'mock',
    hostProjectsRoot?: string,
    databaseUrl?: string,
    runtimeApiUrl?: string,
    runtimeApiToken?: string,
  ) {
    if (runtimeBackend === 'prisma') {
      if (!databaseUrl) {
        throw new Error('DATABASE_URL is required when RUNTIME_BACKEND=prisma');
      }
      this.delegate = new PrismaRuntimeStore(databaseUrl);
      const internalRuntimeUrl = typeof runtimeApiUrl === 'string' && runtimeApiUrl.trim().length > 0
        ? runtimeApiUrl.trim()
        : 'http://127.0.0.1:4080';
      this.runtimeExecutor = new RuntimeCore({
        serverUrl: internalRuntimeUrl,
        token: runtimeApiToken ?? '',
        workspaceRoot: defaultProjectPath,
        hostProjectsRoot: hostProjectsRoot ?? '',
        coordinationStore: {
          listPermissions: (state) => this.delegate.listPermissions(state),
          createPermission: (input) => this.delegate.createPermission(input),
          decidePermission: (permissionId, decision) => this.delegate.decidePermission(permissionId, decision),
          getPermissionById: (permissionId) => {
            if (this.delegate instanceof PrismaRuntimeStore) {
              return this.delegate.getPermissionById(permissionId);
            }
            return Promise.resolve(null);
          },
          hasRequestedAction: (input) => {
            if (this.delegate instanceof PrismaRuntimeStore) {
              return this.delegate.hasRequestedAction(input);
            }
            return Promise.resolve(false);
          },
        },
      });
      return;
    }

    this.delegate = new MockRuntimeStore(defaultProjectPath);
    this.runtimeExecutor = null;
  }

  async listSessions() {
    return this.delegate.listSessions();
  }

  async getSession(sessionId: string) {
    return this.delegate.getSession(sessionId);
  }

  async getGeminiSessionCapabilities(sessionId: string) {
    if (this.runtimeExecutor) {
      return this.runtimeExecutor.getGeminiSessionCapabilities(sessionId);
    }
    if ('getGeminiSessionCapabilities' in this.delegate && typeof this.delegate.getGeminiSessionCapabilities === 'function') {
      return this.delegate.getGeminiSessionCapabilities(sessionId);
    }
    throw new Error('GEMINI_CAPABILITIES_NOT_SUPPORTED');
  }

  async createSession(input: CreateSessionInput) {
    if (input.branch) {
      await ensureWorktree(input.path, input.branch);
    }

    const session = await this.delegate.createSession(input);

    this.emitRealtimeChannel({
      type: 'session.created',
      sessionId: session.id,
      session,
    });

    return session;
  }

  async updateApprovalPolicy(sessionId: string, approvalPolicy: ApprovalPolicy) {
    if (typeof this.delegate.updateApprovalPolicy === 'function') {
      const session = await this.delegate.updateApprovalPolicy(sessionId, approvalPolicy);
      this.emitRealtimeChannel({
        type: 'session.updated',
        sessionId,
        session,
      });
      return session;
    }
    throw new Error('UPDATE_APPROVAL_POLICY_NOT_SUPPORTED');
  }

  async listMessages(sessionId: string, options?: { afterSeq?: number; afterId?: string; limit?: number }) {
    return this.delegate.listMessages(sessionId, options);
  }

  async listChatEvents(chatId: string, options?: { afterSeq?: number; limit?: number }) {
    if (typeof this.delegate.listChatEvents === 'function') {
      return this.delegate.listChatEvents(chatId, options);
    }
    return [];
  }

  async appendMessage(sessionId: string, input: AppendMessageInput) {
    const event = await this.delegate.appendMessage(sessionId, input);
    this.emitRealtimeChannel({
      type: 'event.appended',
      sessionId,
      ...extractEventChatScope(event),
      event,
      source: 'mutation',
    });
    return event;
  }

  async submitUserPrompt(sessionId: string, input: AppendMessageInput) {
    const promptInput = asUserPromptInput(input);
    const created = await this.delegate.appendMessage(sessionId, promptInput);
    this.emitRealtimeChannel({
      type: 'event.appended',
      sessionId,
      ...extractEventChatScope(created),
      event: created,
      source: 'mutation',
    });
    if (this.runtimeExecutor) {
      await this.runtimeExecutor.triggerPersistedUserMessage(sessionId, promptInput);
    }
    return created;
  }

  async appendChatEvent(
    chatId: string,
    input: AppendChatEventInput,
  ) {
    if (typeof this.delegate.appendChatEvent === 'function') {
      const event = await this.delegate.appendChatEvent(chatId, input);
      this.emitRealtimeChannel({
        type: 'event.appended',
        sessionId: input.sessionId,
        chatId,
        event,
        source: 'mutation',
      });
      return event;
    }
    throw new Error('APPEND_CHAT_EVENT_NOT_SUPPORTED');
  }

  async discoverImportedAgentSession(input: Parameters<NonNullable<RuntimeStoreBackend['discoverImportedAgentSession']>>[0]) {
    if (typeof this.delegate.discoverImportedAgentSession === 'function') {
      return this.delegate.discoverImportedAgentSession(input);
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async ensureImportedAgentChat(input: Parameters<NonNullable<RuntimeStoreBackend['ensureImportedAgentChat']>>[0]) {
    if (typeof this.delegate.ensureImportedAgentChat === 'function') {
      return this.delegate.ensureImportedAgentChat(input);
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async appendImportedAgentEvents(input: Parameters<NonNullable<RuntimeStoreBackend['appendImportedAgentEvents']>>[0]) {
    if (typeof this.delegate.appendImportedAgentEvents === 'function') {
      const events = await this.delegate.appendImportedAgentEvents(input);
      for (const event of events) {
        if ('sessionId' in event && typeof event.sessionId === 'string') {
          this.emitRealtimeChannel({
            type: 'event.appended',
            sessionId: event.sessionId,
            chatId: input.chatId,
            event: event as RuntimeMessage,
            source: 'mutation',
          });
        }
      }
      return events;
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async getImportedAgentSessionState(chatId: string) {
    if (typeof this.delegate.getImportedAgentSessionState === 'function') {
      return this.delegate.getImportedAgentSessionState(chatId);
    }
    return null;
  }

  async loadOlderImportedAgentEvents(input: { chatId: string; limitTurns: number }) {
    if (typeof this.delegate.loadOlderImportedAgentEvents === 'function') {
      return this.delegate.loadOlderImportedAgentEvents(input);
    }
    throw new Error('IMPORTED_AGENT_SESSION_NOT_SUPPORTED');
  }

  async submitChatUserPrompt(chatId: string, input: AppendChatEventInput) {
    if (typeof this.delegate.appendChatEvent !== 'function') {
      throw new Error('APPEND_CHAT_EVENT_NOT_SUPPORTED');
    }

    const promptInput = asChatUserPromptInput(chatId, input);
    const created = await this.delegate.appendChatEvent(chatId, promptInput);
    this.emitRealtimeChannel({
      type: 'event.appended',
      sessionId: promptInput.sessionId,
      chatId,
      event: created,
      source: 'mutation',
    });
    if (this.runtimeExecutor) {
      const runtimeSessionId = typeof input.runtimeSessionId === 'string' && input.runtimeSessionId.trim().length > 0
        ? input.runtimeSessionId.trim()
        : promptInput.sessionId;
      await this.runtimeExecutor.triggerPersistedUserMessage(runtimeSessionId, {
        type: promptInput.type,
        title: promptInput.title,
        text: promptInput.text,
        meta: {
          ...(promptInput.meta ?? {}),
          ...(runtimeSessionId !== promptInput.sessionId
            ? {
                runtimeSessionId,
                runtimePersistenceSessionId: promptInput.sessionId,
              }
            : {}),
        },
      });
    }
    return created;
  }

  async runTerminalCommand(chatId: string, input: RunTerminalCommandInput) {
    const command = input.command.trim();
    if (!command) {
      throw new Error('COMMAND_REQUIRED');
    }

    const persistenceSession = await this.delegate.getSession(input.sessionId);
    if (!persistenceSession) {
      throw new Error('SESSION_NOT_FOUND');
    }
    const runtimeSessionId = typeof input.runtimeSessionId === 'string' && input.runtimeSessionId.trim().length > 0
      ? input.runtimeSessionId.trim()
      : input.sessionId;
    const executionSession = runtimeSessionId === input.sessionId
      ? persistenceSession
      : await this.delegate.getSession(runtimeSessionId);
    if (!executionSession) {
      throw new Error('RUNTIME_SESSION_NOT_FOUND');
    }

    const startedAt = new Date().toISOString();
    let stdout = '';
    let stderr = '';
    let exitCode = 0;
    let cwd = '';
    try {
      cwd = this.resolveExecutionCwd(executionSession.metadata.path, executionSession.metadata.branch);
      const result = await execAsync(command, {
        cwd,
        timeout: TERMINAL_COMMAND_TIMEOUT_MS,
        maxBuffer: TERMINAL_COMMAND_MAX_BUFFER,
        shell: '/bin/bash',
      });
      stdout = result.stdout;
      stderr = result.stderr;
    } catch (error) {
      const err = error as Error & { stdout?: string; stderr?: string; code?: number | string };
      stdout = err.stdout ?? '';
      stderr = err.stderr ?? err.message;
      exitCode = typeof err.code === 'number' ? err.code : 1;
    }

    const output = trimTerminalOutput([stdout, stderr].filter(Boolean).join('\n'));
    const preview = output || '(no output)';
    return this.appendChatEvent(chatId, {
      sessionId: input.sessionId,
      type: 'tool',
      title: exitCode === 0 ? 'Terminal completed' : 'Terminal failed',
      text: `$ ${command}\n${preview}`,
      meta: {
        role: 'terminal',
        actor: 'terminal',
        kind: 'terminal_result',
        chatId,
        actionType: 'command_execution',
        composerMode: 'terminal',
        startedAt,
        completedAt: new Date().toISOString(),
        exitCode,
        command,
        execCwd: cwd,
        ...(runtimeSessionId !== input.sessionId ? { runtimeSessionId } : {}),
      },
    });
  }

  async listRealtimeEvents(sessionId: string, options?: { afterCursor?: number; limit?: number; chatId?: string }) {
    if (this.runtimeExecutor) {
      return this.runtimeExecutor.listRealtimeEvents(sessionId, options);
    }
    if ('listRealtimeEvents' in this.delegate && typeof this.delegate.listRealtimeEvents === 'function') {
      return this.delegate.listRealtimeEvents(sessionId, options);
    }
    return { events: [], cursor: 0 };
  }

  async applySessionAction(sessionId: string, action: SessionAction, chatId?: string) {
    const sessionForCleanup = action === 'kill'
      ? await this.delegate.getSession(sessionId).catch(() => null)
      : null;
    if (this.runtimeExecutor) {
      if (action === 'retry' || action === 'resume') {
        const result = await this.delegate.applySessionAction(sessionId, action, chatId);
        const latestUserMessage = typeof this.delegate.getLatestUserMessageForAction === 'function'
          ? await this.delegate.getLatestUserMessageForAction(sessionId, chatId)
          : null;
        if (latestUserMessage) {
          await this.runtimeExecutor.triggerPersistedUserMessage(sessionId, latestUserMessage);
        }
        this.emitRealtimeChannel({ type: 'session.action', sessionId, ...(chatId ? { chatId } : {}), action });
        return result;
      }
      if (action === 'kill') {
        await this.runtimeExecutor.applySessionAction(sessionId, 'abort');
        const result = await this.delegate.applySessionAction(sessionId, action, chatId);
        await this.cleanupKilledSessionWorktree(sessionForCleanup);
        this.emitRealtimeChannel({ type: 'session.action', sessionId, ...(chatId ? { chatId } : {}), action });
        return result;
      }
      await this.runtimeExecutor.applySessionAction(sessionId, action, chatId);
      const result = await this.delegate.applySessionAction(sessionId, action, chatId);
      this.emitRealtimeChannel({ type: 'session.action', sessionId, ...(chatId ? { chatId } : {}), action });
      return result;
    }
    const result = await this.delegate.applySessionAction(sessionId, action, chatId);
    if (action === 'kill') {
      await this.cleanupKilledSessionWorktree(sessionForCleanup);
    }
    this.emitRealtimeChannel({ type: 'session.action', sessionId, ...(chatId ? { chatId } : {}), action });
    return result;
  }

  private async cleanupKilledSessionWorktree(session: RuntimeSession | null): Promise<void> {
    const branch = typeof session?.metadata.branch === 'string' && session.metadata.branch.trim().length > 0
      ? session.metadata.branch.trim()
      : null;
    if (!session || !branch) {
      return;
    }
    const projectPath = this.resolveExecutionCwd(session.metadata.path);
    await removeWorktree(projectPath, branch).catch(() => undefined);
  }

  async isSessionRunning(sessionId: string, chatId?: string) {
    if (this.runtimeExecutor) {
      const [runtimeRunning, persistedRunning] = await Promise.all([
        this.runtimeExecutor.isSessionRunning(sessionId, chatId),
        this.delegate.isSessionRunning(sessionId, chatId),
      ]);
      return runtimeRunning || persistedRunning;
    }
    return this.delegate.isSessionRunning(sessionId, chatId);
  }

  beginShutdownDrain(): void {
    this.runtimeExecutor?.beginShutdownDrain();
  }

  async cleanupEmptyChats(maxAgeMs: number): Promise<number> {
    if (this.delegate instanceof PrismaRuntimeStore) {
      return this.delegate.cleanupEmptyChats(maxAgeMs);
    }
    return 0;
  }

  async awaitDrain(timeoutMs: number): Promise<void> {
    if (!this.runtimeExecutor) {
      return;
    }
    await this.runtimeExecutor.awaitDrain(timeoutMs);
  }

  async listPermissions(state?: PermissionRequest['state']) {
    if (this.runtimeExecutor) {
      return this.runtimeExecutor.listPermissions(state);
    }
    return this.delegate.listPermissions(state);
  }

  async createPermission(input: CreatePermissionInput) {
    const permission = this.runtimeExecutor
      ? await this.runtimeExecutor.createPermission(input)
      : await this.delegate.createPermission(input);
    this.emitRealtimeChannel({
      type: 'permission.created',
      sessionId: permission.sessionId,
      ...(typeof permission.chatId === 'string' && permission.chatId.trim().length > 0
        ? { chatId: permission.chatId.trim() }
        : {}),
      permission,
    });
    return permission;
  }

  async decidePermission(permissionId: string, decision: PermissionDecision) {
    if (this.runtimeExecutor) {
      const updated = await this.runtimeExecutor.decidePermission(permissionId, decision);
      const normalizedChatId = typeof updated.chatId === 'string' && updated.chatId.trim().length > 0
        ? updated.chatId.trim()
        : undefined;
      if (
        decision !== 'deny'
        && typeof this.delegate.getLatestUserMessageForAction === 'function'
      ) {
        const runtimeStillRunning = await this.runtimeExecutor.isSessionRunning(updated.sessionId, normalizedChatId);
        if (!runtimeStillRunning) {
          const latestUserMessage = await this.delegate.getLatestUserMessageForAction(updated.sessionId, normalizedChatId);
          if (latestUserMessage) {
            await this.runtimeExecutor.triggerPersistedUserMessage(updated.sessionId, latestUserMessage);
          }
        }
      }
      this.emitRealtimeChannel({
        type: 'permission.updated',
        sessionId: updated.sessionId,
        ...(normalizedChatId ? { chatId: normalizedChatId } : {}),
        permission: updated,
      });
      return updated;
    }
    const updated = await this.delegate.decidePermission(permissionId, decision);
    const normalizedChatId = typeof updated.chatId === 'string' && updated.chatId.trim().length > 0
      ? updated.chatId.trim()
      : undefined;
    this.emitRealtimeChannel({
      type: 'permission.updated',
      sessionId: updated.sessionId,
      ...(normalizedChatId ? { chatId: normalizedChatId } : {}),
      permission: updated,
    });
    return updated;
  }

  subscribeRealtimeChannel(
    filter: RuntimeRealtimeChannelFilter,
    listener: RuntimeRealtimeChannelListener,
  ): () => void {
    const subscription = {
      filter: normalizeRealtimeChannelFilter(filter),
      listener,
    };
    this.realtimeSubscribers.add(subscription);
    const runtimeEventFilter = subscription.filter.chatId && !subscription.filter.includeUnassigned
      ? { chatId: subscription.filter.chatId }
      : {};
    const unsubscribeRuntime = this.runtimeExecutor?.subscribeRealtimeEvents?.(
      subscription.filter.sessionId,
      runtimeEventFilter,
      (record) => {
        const eventChatScope = extractEventChatScope(record.event);
        this.deliverRealtimeChannelEvent(subscription, {
          type: 'event.appended',
          sessionId: record.event.sessionId,
          ...eventChatScope,
          event: record.event,
          cursor: record.cursor,
          source: 'runtime',
        });
      },
    );

    return () => {
      this.realtimeSubscribers.delete(subscription);
      unsubscribeRuntime?.();
    };
  }

  private emitRealtimeChannel(event: RuntimeRealtimeChannelEvent): void {
    for (const subscription of this.realtimeSubscribers) {
      this.deliverRealtimeChannelEvent(subscription, event);
    }
  }

  private deliverRealtimeChannelEvent(
    subscription: {
      filter: RuntimeRealtimeChannelFilter;
      listener: RuntimeRealtimeChannelListener;
    },
    event: RuntimeRealtimeChannelEvent,
  ): void {
    if (!matchesRealtimeChannelFilter(subscription.filter, event)) {
      return;
    }
    subscription.listener(event);
  }

  resolveExecutionCwd(cwdHint?: string, branch?: string): string {
    const basePath = (() => {
      if ('resolveExecutionCwd' in this.delegate && typeof this.delegate.resolveExecutionCwd === 'function') {
        return (this.delegate as any).resolveExecutionCwd(cwdHint);
      }
      return cwdHint || '';
    })();
    return branch ? computeWorktreePath(basePath, branch) : basePath;
  }
}

function normalizeRealtimeChannelFilter(filter: RuntimeRealtimeChannelFilter): RuntimeRealtimeChannelFilter {
  const sessionId = filter.sessionId.trim();
  const chatId = typeof filter.chatId === 'string' && filter.chatId.trim().length > 0
    ? filter.chatId.trim()
    : undefined;
  return {
    sessionId,
    ...(chatId ? { chatId } : {}),
    ...(filter.includeUnassigned ? { includeUnassigned: true } : {}),
  };
}

function extractEventChatScope(event: RuntimeMessage): { chatId?: string } {
  const chatId = typeof event.meta?.chatId === 'string' && event.meta.chatId.trim().length > 0
    ? event.meta.chatId.trim()
    : undefined;
  return chatId ? { chatId } : {};
}

function matchesRealtimeChannelFilter(
  filter: RuntimeRealtimeChannelFilter,
  event: RuntimeRealtimeChannelEvent,
): boolean {
  if (filter.sessionId !== event.sessionId) {
    return false;
  }
  if (!filter.chatId) {
    return true;
  }
  const eventChatId = typeof event.chatId === 'string' && event.chatId.trim().length > 0
    ? event.chatId.trim()
    : undefined;
  if (eventChatId) {
    return eventChatId === filter.chatId;
  }
  return filter.includeUnassigned === true;
}
