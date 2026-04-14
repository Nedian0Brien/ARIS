import { randomUUID } from 'node:crypto';
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
import { HappyRuntimeStore } from './runtime/happyClient.js';
import { PrismaRuntimeStore } from './runtime/prismaStore.js';
import { computeWorktreePath, ensureWorktree } from './runtime/worktreeManager.js';

type RuntimeBackend = 'mock' | 'happy' | 'prisma';

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

type CreatePermissionInput = {
  sessionId: string;
  chatId?: string | null;
  agent: PermissionRequest['agent'];
  command: string;
  reason: string;
  risk: PermissionRisk;
};

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
  appendChatEvent?(
    chatId: string,
    input: { sessionId: string; runId?: string; type: string; title?: string; text: string; meta?: Record<string, unknown> },
  ): Promise<RuntimeMessage>;
  getLatestUserMessageForAction?(sessionId: string, chatId?: string): Promise<AppendMessageInput | null>;
  applySessionAction(sessionId: string, action: SessionAction, chatId?: string): Promise<{ accepted: boolean; message: string; at: string }>;
  isSessionRunning(sessionId: string, chatId?: string): Promise<boolean>;
  listPermissions(state?: PermissionRequest['state']): Promise<PermissionRequest[]>;
  createPermission(input: CreatePermissionInput): Promise<PermissionRequest>;
  decidePermission(permissionId: string, decision: PermissionDecision): Promise<PermissionRequest>;
}

type RuntimeExecutor = Pick<
  HappyRuntimeStore,
  | 'triggerPersistedUserMessage'
  | 'listRealtimeEvents'
  | 'applySessionAction'
  | 'isSessionRunning'
  | 'listPermissions'
  | 'createPermission'
  | 'decidePermission'
  | 'getGeminiSessionCapabilities'
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

  constructor(
    defaultProjectPath: string,
    runtimeBackend: RuntimeBackend = 'mock',
    happyServerUrl?: string,
    happyServerToken?: string,
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
      this.runtimeExecutor = new HappyRuntimeStore({
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

    if (runtimeBackend === 'happy') {
      if (!happyServerUrl) {
        throw new Error('HAPPY_SERVER_URL is required when RUNTIME_BACKEND=happy');
      }
      this.delegate = new HappyRuntimeStore({
        serverUrl: happyServerUrl,
        token: happyServerToken ?? '',
        workspaceRoot: defaultProjectPath,
        hostProjectsRoot: hostProjectsRoot ?? '',
      });
      this.runtimeExecutor = null;
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
    const session = await this.delegate.createSession(input);

    if (input.branch) {
      ensureWorktree(session.metadata.path, input.branch).catch((error) => {
        process.stderr.write(
          `[worktree] failed to ensure worktree for branch "${input.branch}": ${error instanceof Error ? error.message : String(error)}\n`,
        );
      });
    }

    return session;
  }

  async updateApprovalPolicy(sessionId: string, approvalPolicy: ApprovalPolicy) {
    if (typeof this.delegate.updateApprovalPolicy === 'function') {
      return this.delegate.updateApprovalPolicy(sessionId, approvalPolicy);
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
    const created = await this.delegate.appendMessage(sessionId, input);
    if (this.runtimeExecutor && input.meta?.role !== 'agent') {
      await this.runtimeExecutor.triggerPersistedUserMessage(sessionId, input);
    }
    return created;
  }

  async appendChatEvent(
    chatId: string,
    input: { sessionId: string; runId?: string; type: string; title?: string; text: string; meta?: Record<string, unknown> },
  ) {
    if (typeof this.delegate.appendChatEvent === 'function') {
      const created = await this.delegate.appendChatEvent(chatId, input);
      if (this.runtimeExecutor && input.meta?.role !== 'agent') {
        await this.runtimeExecutor.triggerPersistedUserMessage(input.sessionId, {
          type: input.type,
          title: input.title,
          text: input.text,
          meta: input.meta,
        });
      }
      return created;
    }
    throw new Error('APPEND_CHAT_EVENT_NOT_SUPPORTED');
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
    if (this.runtimeExecutor) {
      if (action === 'retry' || action === 'resume') {
        const result = await this.delegate.applySessionAction(sessionId, action, chatId);
        const latestUserMessage = typeof this.delegate.getLatestUserMessageForAction === 'function'
          ? await this.delegate.getLatestUserMessageForAction(sessionId, chatId)
          : null;
        if (latestUserMessage) {
          await this.runtimeExecutor.triggerPersistedUserMessage(sessionId, latestUserMessage);
        }
        return result;
      }
      if (action === 'kill') {
        await this.runtimeExecutor.applySessionAction(sessionId, 'abort');
        return this.delegate.applySessionAction(sessionId, action, chatId);
      }
      await this.runtimeExecutor.applySessionAction(sessionId, action, chatId);
      return this.delegate.applySessionAction(sessionId, action, chatId);
    }
    return this.delegate.applySessionAction(sessionId, action, chatId);
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
    if (this.runtimeExecutor) {
      return this.runtimeExecutor.createPermission(input);
    }
    return this.delegate.createPermission(input);
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
      return updated;
    }
    return this.delegate.decidePermission(permissionId, decision);
  }

  resolveExecutionCwd(cwdHint?: string, branch?: string): string {
    if (branch && cwdHint) {
      return computeWorktreePath(cwdHint, branch);
    }
    if ('resolveExecutionCwd' in this.delegate && typeof this.delegate.resolveExecutionCwd === 'function') {
      return (this.delegate as any).resolveExecutionCwd(cwdHint);
    }
    return cwdHint || '';
  }
}
