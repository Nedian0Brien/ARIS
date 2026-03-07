import { randomUUID } from 'node:crypto';
import type {
  ApprovalPolicy,
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
  agent: PermissionRequest['agent'];
  command: string;
  reason: string;
  risk: PermissionRisk;
};

interface RuntimeStoreBackend {
  listSessions(): Promise<RuntimeSession[]>;
  getSession(sessionId: string): Promise<RuntimeSession | null>;
  createSession(input: CreateSessionInput): Promise<RuntimeSession>;
  listMessages(sessionId: string): Promise<RuntimeMessage[]>;
  appendMessage(sessionId: string, input: AppendMessageInput): Promise<RuntimeMessage>;
  applySessionAction(sessionId: string, action: SessionAction): Promise<{ accepted: boolean; message: string; at: string }>;
  isSessionRunning(sessionId: string): Promise<boolean>;
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

  async listMessages(sessionId: string): Promise<RuntimeMessage[]> {
    return this.messages.get(sessionId) ?? [];
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

  async applySessionAction(sessionId: string, action: SessionAction): Promise<{ accepted: boolean; message: string; at: string }> {
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

  async isSessionRunning(sessionId: string): Promise<boolean> {
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

    await this.appendMessage(permission.sessionId, {
      type: 'message',
      title: 'Text Reply',
      text: `Permission ${permission.command} -> ${permission.state}`,
      meta: { permissionId, decision },
    });

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

  async createSession(input: CreateSessionInput) {
    return this.delegate.createSession(input);
  }

  async listMessages(sessionId: string) {
    return this.delegate.listMessages(sessionId);
  }

  async appendMessage(sessionId: string, input: AppendMessageInput) {
    return this.delegate.appendMessage(sessionId, input);
  }

  async applySessionAction(sessionId: string, action: SessionAction) {
    return this.delegate.applySessionAction(sessionId, action);
  }

  async isSessionRunning(sessionId: string) {
    return this.delegate.isSessionRunning(sessionId);
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
}
