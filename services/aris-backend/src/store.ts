import { randomUUID } from 'node:crypto';
import type {
  PermissionDecision,
  PermissionRequest,
  PermissionRisk,
  RuntimeMessage,
  RuntimeSession,
  SessionAction,
  SessionStatus,
} from './types.js';

type CreateSessionInput = {
  path: string;
  flavor: RuntimeSession['metadata']['flavor'];
  status?: SessionStatus;
  riskScore?: number;
};

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

export class RuntimeStore {
  private readonly sessions = new Map<string, RuntimeSession>();
  private readonly messages = new Map<string, RuntimeMessage[]>();
  private readonly permissions = new Map<string, PermissionRequest>();

  constructor(defaultProjectPath: string) {
    // Keep store intentionally empty on startup.
    // Sessions, messages, and permissions should be created only by real user actions or runtime events.
    void defaultProjectPath;
  }

  listSessions(): RuntimeSession[] {
    return [...this.sessions.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }

  getSession(sessionId: string): RuntimeSession | null {
    return this.sessions.get(sessionId) ?? null;
  }

  createSession(input: CreateSessionInput): RuntimeSession {
    const now = new Date().toISOString();
    const session: RuntimeSession = {
      id: randomUUID(),
      metadata: {
        flavor: input.flavor,
        path: input.path,
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

  listMessages(sessionId: string): RuntimeMessage[] {
    return this.messages.get(sessionId) ?? [];
  }

  appendMessage(sessionId: string, input: AppendMessageInput): RuntimeMessage {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
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
    if (input.type === 'message' && (!input.meta || input.meta.role !== 'agent')) {
      setTimeout(() => {
        this.appendMessage(sessionId, {
          type: 'message',
          title: 'Text Reply',
          text: `[${session.metadata.flavor}] I received your message: "${input.text}". How can I help you with the code in ${session.metadata.path}?`,
          meta: { role: 'agent' },
        });
      }, 1500);
    }

    return message;
  }

  applySessionAction(sessionId: string, action: SessionAction): { accepted: boolean; message: string; at: string } {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('SESSION_NOT_FOUND');
    }

    const at = new Date().toISOString();
    const statusByAction: Record<SessionAction, SessionStatus> = {
      abort: 'stopped',
      retry: 'running',
      kill: 'stopped',
      resume: 'running',
    };

    session.state.status = statusByAction[action];
    session.updatedAt = at;

    if (action === 'kill') {
      session.riskScore = 85;
    } else if (action === 'retry' || action === 'resume') {
      session.riskScore = Math.max(10, session.riskScore - 15);
    }

    this.sessions.set(sessionId, session);
    this.appendMessage(sessionId, {
      type: 'tool',
      title: 'Command Execution',
      text: `$ session ${action}\\nexit code: 0`,
      meta: { system: true, action },
    });

    return {
      accepted: true,
      message: `${action.toUpperCase()} acknowledged`,
      at,
    };
  }

  listPermissions(state?: PermissionRequest['state']): PermissionRequest[] {
    const list = [...this.permissions.values()].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
    return state ? list.filter((item) => item.state === state) : list;
  }

  createPermission(input: CreatePermissionInput): PermissionRequest {
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

  decidePermission(permissionId: string, decision: PermissionDecision): PermissionRequest {
    const permission = this.permissions.get(permissionId);
    if (!permission) {
      throw new Error('PERMISSION_NOT_FOUND');
    }

    permission.state = decision === 'deny' ? 'denied' : 'approved';
    this.permissions.set(permission.id, permission);

    this.appendMessage(permission.sessionId, {
      type: 'message',
      title: 'Text Reply',
      text: `Permission ${permission.command} -> ${permission.state}`,
      meta: { permissionId, decision },
    });

    return permission;
  }
}
