import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
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
} from '../types.js';

type CreateSessionInput = {
  path: string;
  flavor: RuntimeSession['metadata']['flavor'];
  approvalPolicy?: ApprovalPolicy;
  model?: string;
  status?: SessionStatus;
  riskScore?: number;
  branch?: string;
};

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

function toRuntimeSession(row: {
  id: string;
  flavor: string;
  path: string;
  branch: string | null;
  status: string;
  approvalPolicy: string;
  model: string | null;
  riskScore: number;
  updatedAt: Date;
}): RuntimeSession {
  return {
    id: row.id,
    metadata: {
      flavor: row.flavor as RuntimeSession['metadata']['flavor'],
      path: row.path,
      approvalPolicy: row.approvalPolicy as ApprovalPolicy,
      ...(row.model ? { model: row.model } : {}),
      ...(row.branch ? { branch: row.branch } : {}),
    },
    state: {
      status: row.status as SessionStatus,
    },
    updatedAt: row.updatedAt.toISOString(),
    riskScore: row.riskScore,
  };
}

function toRuntimeMessage(row: {
  id: string;
  sessionId: string;
  type: string;
  title: string | null;
  text: string;
  meta: unknown;
  seq: number;
  createdAt: Date;
}): RuntimeMessage {
  return {
    id: row.id,
    sessionId: row.sessionId,
    type: row.type,
    title: row.title ?? row.type,
    text: row.text,
    createdAt: row.createdAt.toISOString(),
    meta: {
      ...(row.meta && typeof row.meta === 'object' ? (row.meta as Record<string, unknown>) : {}),
      seq: row.seq,
    },
  };
}

function normalizeMetaChatId(meta: unknown): string | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  const value = (meta as { chatId?: unknown }).chatId;
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

export function filterRealtimeRowsByChat<
  TRow extends {
    meta: unknown;
  },
>(rows: TRow[], chatId?: string): TRow[] {
  const normalizedChatId = typeof chatId === 'string' && chatId.trim().length > 0
    ? chatId.trim()
    : null;
  if (!normalizedChatId) {
    return rows;
  }
  return rows.filter((row) => normalizeMetaChatId(row.meta) === normalizedChatId);
}

function deriveRunningStateFromMeta(meta: unknown): boolean | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  const record = meta as Record<string, unknown>;
  const action = typeof record.action === 'string' ? record.action.trim() : '';
  if (action === 'abort' || action === 'kill') {
    return false;
  }
  if (action === 'retry' || action === 'resume') {
    return true;
  }
  const role = typeof record.role === 'string' ? record.role.trim() : '';
  if (role === 'user') {
    return true;
  }
  if (role === 'agent') {
    return false;
  }
  return null;
}

export function resolveChatRunningState<
  TRow extends {
    meta: unknown;
  },
>(rows: TRow[], chatId: string): boolean {
  const filteredRows = filterRealtimeRowsByChat(rows, chatId);
  for (let index = filteredRows.length - 1; index >= 0; index -= 1) {
    const derived = deriveRunningStateFromMeta(filteredRows[index]?.meta);
    if (derived !== null) {
      return derived;
    }
  }
  return false;
}

// ── Chat snapshot derivation from event stream ──

type MessageRow = {
  id: string;
  text: string;
  meta: unknown;
  createdAt: Date;
};

const TERMINAL_RUN_STATUSES = new Set([
  'completed', 'failed', 'aborted', 'timed_out', 'turn_incomplete', 'run_stale_cleanup',
]);

function readMetaString(meta: unknown, key: string): string {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return '';
  const value = (meta as Record<string, unknown>)[key];
  return typeof value === 'string' ? value.trim().toLowerCase() : '';
}

function isRunLifecycleMessage(meta: unknown): boolean {
  return readMetaString(meta, 'streamEvent') === 'run_status';
}

function deriveErrorSignalFromMeta(meta: unknown): boolean {
  const streamEvent = readMetaString(meta, 'streamEvent');
  if (streamEvent === 'runtime_disconnected' || streamEvent === 'stream_error' || streamEvent === 'runtime_error') {
    return true;
  }
  if (streamEvent === 'run_status') {
    const runStatus = readMetaString(meta, 'runStatus')
      || readMetaString(meta, 'sessionTurnStatus');
    return TERMINAL_RUN_STATUSES.has(runStatus) && runStatus !== 'completed';
  }
  return false;
}

export type ChatSnapshot = {
  chatId: string;
  preview: string;
  hasEvents: boolean;
  hasErrorSignal: boolean;
  latestEventId: string | null;
  latestEventAt: string | null;
  latestEventIsUser: boolean;
  isRunning: boolean;
};

function deriveSnapshotFromRows(rows: MessageRow[], chatId: string): ChatSnapshot {
  const chatRows = filterRealtimeRowsByChat(rows, chatId);
  const isRunning = resolveChatRunningState(rows, chatId);

  // Find latest non-lifecycle event for preview/snapshot fields
  let latestVisible: MessageRow | null = null;
  for (let i = chatRows.length - 1; i >= 0; i -= 1) {
    if (!isRunLifecycleMessage(chatRows[i].meta)) {
      latestVisible = chatRows[i];
      break;
    }
  }

  // Error signal from the absolute latest event (including lifecycle)
  const latestEvent = chatRows.length > 0 ? chatRows[chatRows.length - 1] : null;
  const hasErrorSignal = latestEvent ? deriveErrorSignalFromMeta(latestEvent.meta) : false;

  if (!latestVisible) {
    return {
      chatId,
      preview: '',
      hasEvents: false,
      hasErrorSignal,
      latestEventId: null,
      latestEventAt: null,
      latestEventIsUser: false,
      isRunning,
    };
  }

  const role = readMetaString(latestVisible.meta, 'role');
  const preview = (latestVisible.text || '').slice(0, 240).split('\n')[0] || '';

  return {
    chatId,
    preview,
    hasEvents: true,
    hasErrorSignal,
    latestEventId: latestVisible.id,
    latestEventAt: latestVisible.createdAt.toISOString(),
    latestEventIsUser: role === 'user',
    isRunning,
  };
}

function toPermissionRequest(row: {
  id: string;
  sessionId: string;
  chatId: string | null;
  agent: string;
  command: string;
  reason: string;
  risk: string;
  state: string;
  requestedAt: Date;
}): PermissionRequest {
  return {
    id: row.id,
    sessionId: row.sessionId,
    ...(row.chatId ? { chatId: row.chatId } : {}),
    agent: row.agent as PermissionRequest['agent'],
    command: row.command,
    reason: row.reason,
    risk: row.risk as PermissionRisk,
    state: row.state as PermissionRequest['state'],
    requestedAt: row.requestedAt.toISOString(),
  };
}

export class PrismaRuntimeStore {
  private readonly db: PrismaClient;

  constructor(databaseUrl: string) {
    // PrismaPg bundles its own pg types; cast via any to avoid cross-package Pool type mismatch
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const adapter = new PrismaPg({ connectionString: databaseUrl } as any);
    this.db = new PrismaClient({ adapter } as any);
  }

  async connect(): Promise<void> {
    await this.db.$connect();
  }

  async disconnect(): Promise<void> {
    await this.db.$disconnect();
  }

  async listSessions(): Promise<RuntimeSession[]> {
    const rows = await this.db.session.findMany({
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(toRuntimeSession);
  }

  async getSession(sessionId: string): Promise<RuntimeSession | null> {
    const row = await this.db.session.findUnique({ where: { id: sessionId } });
    return row ? toRuntimeSession(row) : null;
  }

  async getGeminiSessionCapabilities(sessionId: string): Promise<GeminiSessionCapabilities> {
    const session = await this.getSession(sessionId);
    if (!session) throw new Error('SESSION_NOT_FOUND');
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
    const row = await this.db.session.create({
      data: {
        id: randomUUID(),
        flavor: input.flavor,
        path: input.path,
        branch: input.branch ?? null,
        approvalPolicy: input.approvalPolicy ?? 'on-request',
        model: input.model ?? null,
        status: input.status ?? 'idle',
        riskScore: input.riskScore ?? 20,
      },
    });
    return toRuntimeSession(row);
  }

  async updateApprovalPolicy(sessionId: string, approvalPolicy: ApprovalPolicy): Promise<RuntimeSession> {
    const existing = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!existing) throw new Error('SESSION_NOT_FOUND');
    const row = await this.db.session.update({
      where: { id: sessionId },
      data: { approvalPolicy, updatedAt: new Date() },
    });
    return toRuntimeSession(row);
  }

  async listMessages(
    sessionId: string,
    options: { afterSeq?: number; afterId?: string; limit?: number } = {},
  ): Promise<RuntimeMessage[]> {
    // afterId: find seq of that message, then get everything after it
    if (typeof options.afterId === 'string' && options.afterId) {
      const pivot = await this.db.sessionMessage.findUnique({
        where: { id: options.afterId },
        select: { seq: true },
      });
      const afterSeq = pivot?.seq ?? 0;
      const rows = await this.db.sessionMessage.findMany({
        where: { sessionId, seq: { gt: afterSeq } },
        orderBy: { seq: 'asc' },
        ...(options.limit ? { take: options.limit } : {}),
      });
      return rows.map(toRuntimeMessage);
    }

    const afterSeq = Number.isFinite(options.afterSeq) ? Math.max(0, Math.floor(Number(options.afterSeq))) : 0;
    const rows = await this.db.sessionMessage.findMany({
      where: { sessionId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      ...(options.limit ? { take: options.limit } : {}),
    });
    return rows.map(toRuntimeMessage);
  }

  async listRealtimeEvents(
    sessionId: string,
    options: { afterCursor?: number; limit?: number; chatId?: string } = {},
  ): Promise<{ events: RuntimeMessage[]; cursor: number }> {
    const afterSeq = options.afterCursor ?? 0;
    const rows = await this.db.sessionMessage.findMany({
      where: { sessionId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      ...(options.limit ? { take: options.limit } : {}),
    });
    const filteredRows = filterRealtimeRowsByChat(rows, options.chatId);
    const events = filteredRows.map(toRuntimeMessage);
    const cursor = rows.length > 0 ? rows[rows.length - 1].seq : afterSeq;
    return { events, cursor };
  }

  async appendMessage(sessionId: string, input: AppendMessageInput): Promise<RuntimeMessage> {
    const session = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error('SESSION_NOT_FOUND');

    const isAgentMessage = input.meta?.role === 'agent';
    const isUserPrompt = input.type === 'message' && !isAgentMessage;

    // next seq number
    const agg = await this.db.sessionMessage.aggregate({
      where: { sessionId },
      _max: { seq: true },
    });
    const nextSeq = (agg._max.seq ?? 0) + 1;

    const newStatus: SessionStatus = isUserPrompt ? 'running' : isAgentMessage ? 'idle' : (session.status as SessionStatus);

    const [row] = await this.db.$transaction([
      this.db.sessionMessage.create({
        data: {
          id: randomUUID(),
          sessionId,
          type: input.type,
          title: input.title ?? input.type,
          text: input.text,
          meta: (input.meta ?? {}) as Parameters<typeof this.db.sessionMessage.create>[0]['data']['meta'],
          seq: nextSeq,
        },
      }),
      this.db.session.update({
        where: { id: sessionId },
        data: { status: newStatus, updatedAt: new Date() },
      }),
    ]);

    return toRuntimeMessage(row);
  }

  async applySessionAction(
    sessionId: string,
    action: SessionAction,
    chatId?: string,
  ): Promise<{ accepted: boolean; message: string; at: string }> {
    const session = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error('SESSION_NOT_FOUND');

    const at = new Date().toISOString();

    if (action === 'kill') {
      await this.db.session.delete({ where: { id: sessionId } });
      return { accepted: true, message: 'KILL acknowledged', at };
    }

    const statusByAction: Record<Exclude<SessionAction, 'kill'>, SessionStatus> = {
      abort: 'idle',
      retry: 'running',
      resume: 'running',
    };

    const normalizedChatId = typeof chatId === 'string' && chatId.trim().length > 0
      ? chatId.trim()
      : null;
    const updates: { status?: string; riskScore?: number } = normalizedChatId && action === 'abort'
      ? {}
      : { status: statusByAction[action] };
    if (action === 'retry' || action === 'resume') {
      updates.riskScore = Math.max(10, session.riskScore - 15);
    }

    await this.db.$transaction([
      this.db.session.update({
        where: { id: sessionId },
        data: { ...updates, updatedAt: new Date(at) },
      }),
      this.db.sessionMessage.create({
        data: {
          id: randomUUID(),
          sessionId,
          type: 'tool',
          title: 'Command Execution',
          text: `$ session ${action}\nexit code: 0`,
          meta: {
            system: true,
            action,
            ...(normalizedChatId ? { chatId: normalizedChatId } : {}),
          },
          seq: await this.db.sessionMessage
            .aggregate({ where: { sessionId }, _max: { seq: true } })
            .then((a) => (a._max.seq ?? 0) + 1),
        },
      }),
    ]);

    return { accepted: true, message: `${action.toUpperCase()} acknowledged`, at };
  }

  async isSessionRunning(sessionId: string, _chatId?: string): Promise<boolean> {
    const normalizedChatId = typeof _chatId === 'string' && _chatId.trim().length > 0
      ? _chatId.trim()
      : null;
    if (normalizedChatId) {
      const rows = await this.db.sessionMessage.findMany({
        where: { sessionId },
        orderBy: { seq: 'asc' },
        take: 200,
      });
      return resolveChatRunningState(rows, normalizedChatId);
    }

    const row = await this.db.session.findUnique({
      where: { id: sessionId },
      select: { status: true },
    });
    if (!row) throw new Error('SESSION_NOT_FOUND');
    return row.status === 'running';
  }

  async listPermissions(state?: PermissionRequest['state']): Promise<PermissionRequest[]> {
    const rows = await this.db.permission.findMany({
      where: state ? { state } : undefined,
      orderBy: { requestedAt: 'desc' },
    });
    return rows.map(toPermissionRequest);
  }

  async createPermission(input: CreatePermissionInput): Promise<PermissionRequest> {
    const session = await this.db.session.findUnique({ where: { id: input.sessionId } });
    if (!session) throw new Error('SESSION_NOT_FOUND');

    const row = await this.db.permission.create({
      data: {
        id: randomUUID(),
        sessionId: input.sessionId,
        chatId: typeof input.chatId === 'string' && input.chatId.trim() ? input.chatId.trim() : null,
        agent: input.agent,
        command: input.command,
        reason: input.reason,
        risk: input.risk,
        state: 'pending',
      },
    });
    return toPermissionRequest(row);
  }

  async decidePermission(permissionId: string, decision: PermissionDecision): Promise<PermissionRequest> {
    const existing = await this.db.permission.findUnique({ where: { id: permissionId } });
    if (!existing) throw new Error('PERMISSION_NOT_FOUND');

    const row = await this.db.permission.update({
      where: { id: permissionId },
      data: {
        state: decision === 'deny' ? 'denied' : 'approved',
        decidedAt: new Date(),
      },
    });
    return toPermissionRequest(row);
  }

  async getChatSnapshots(sessionId: string, chatIds: string[]): Promise<ChatSnapshot[]> {
    const normalizedChatIds = chatIds
      .map((id) => id.trim())
      .filter((id) => id.length > 0);
    if (normalizedChatIds.length === 0) {
      return [];
    }

    const rows = await this.db.sessionMessage.findMany({
      where: { sessionId },
      orderBy: { seq: 'asc' },
      take: 200,
      select: { id: true, text: true, meta: true, createdAt: true },
    });

    return normalizedChatIds.map((chatId) =>
      deriveSnapshotFromRows(rows as MessageRow[], chatId),
    );
  }

  resolveExecutionCwd(cwdHint?: string): string {
    return cwdHint ?? '';
  }
}
