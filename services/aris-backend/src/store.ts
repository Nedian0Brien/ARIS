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

type RuntimeBackend = 'mock' | 'happy';

type CreateSessionInput = {
  path: string;
  flavor: RuntimeSession['metadata']['flavor'];
  approvalPolicy?: ApprovalPolicy;
  model?: string;
  status?: SessionStatus;
  riskScore?: number;
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
  listMessages(sessionId: string, options?: { afterSeq?: number; afterId?: string; limit?: number }): Promise<RuntimeMessage[]>;
  listRealtimeEvents?(sessionId: string, options?: { afterCursor?: number; limit?: number; chatId?: string }): Promise<{ events: RuntimeMessage[]; cursor: number }>;
  appendMessage(sessionId: string, input: AppendMessageInput): Promise<RuntimeMessage>;
  applySessionAction(sessionId: string, action: SessionAction, chatId?: string): Promise<{ accepted: boolean; message: string; at: string }>;
  isSessionRunning(sessionId: string, chatId?: string): Promise<boolean>;
  listPermissions(state?: PermissionRequest['state']): Promise<PermissionRequest[]>;
  createPermission(input: CreatePermissionInput): Promise<PermissionRequest>;
  decidePermission(permissionId: string, decision: PermissionDecision): Promise<PermissionRequest>;
}

class MockRuntimeStore implements RuntimeStoreBackend {
  private readonly sessions = new Map<string, RuntimeSession>();
  private readonly messages = new Map<string, RuntimeMessage[]>();
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

  constructor(
    defaultProjectPath: string,
    runtimeBackend: RuntimeBackend = 'mock',
    happyServerUrl?: string,
    happyServerToken?: string,
    hostProjectsRoot?: string,
  ) {
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
      return;
    }

    this.delegate = new MockRuntimeStore(defaultProjectPath);
  }

  async listSessions() {
    return this.delegate.listSessions();
  }

  async getSession(sessionId: string) {
    return this.delegate.getSession(sessionId);
  }

  async getGeminiSessionCapabilities(sessionId: string) {
    if ('getGeminiSessionCapabilities' in this.delegate && typeof this.delegate.getGeminiSessionCapabilities === 'function') {
      return this.delegate.getGeminiSessionCapabilities(sessionId);
    }
    throw new Error('GEMINI_CAPABILITIES_NOT_SUPPORTED');
  }

  async createSession(input: CreateSessionInput) {
    return this.delegate.createSession(input);
  }

  async listMessages(sessionId: string, options?: { afterSeq?: number; afterId?: string; limit?: number }) {
    return this.delegate.listMessages(sessionId, options);
  }

  async appendMessage(sessionId: string, input: AppendMessageInput) {
    return this.delegate.appendMessage(sessionId, input);
  }

  async listRealtimeEvents(sessionId: string, options?: { afterCursor?: number; limit?: number; chatId?: string }) {
    if ('listRealtimeEvents' in this.delegate && typeof this.delegate.listRealtimeEvents === 'function') {
      return this.delegate.listRealtimeEvents(sessionId, options);
    }
    return { events: [], cursor: 0 };
  }

  async applySessionAction(sessionId: string, action: SessionAction, chatId?: string) {
    return this.delegate.applySessionAction(sessionId, action, chatId);
  }

  async isSessionRunning(sessionId: string, chatId?: string) {
    return this.delegate.isSessionRunning(sessionId, chatId);
  }

  async listPermissions(state?: PermissionRequest['state']) {
    return this.delegate.listPermissions(state);
  }

  async createPermission(input: CreatePermissionInput) {
    return this.delegate.createPermission(input);
  }

  async decidePermission(permissionId: string, decision: PermissionDecision) {
    return this.delegate.decidePermission(permissionId, decision);
  }

  resolveExecutionCwd(cwdHint?: string): string {
    if ('resolveExecutionCwd' in this.delegate && typeof this.delegate.resolveExecutionCwd === 'function') {
      return (this.delegate as any).resolveExecutionCwd(cwdHint);
    }
    return cwdHint || '';
  }
}
