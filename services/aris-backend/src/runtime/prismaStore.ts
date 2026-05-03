import { randomUUID } from 'node:crypto';
import { Prisma, PrismaClient } from '@prisma/client';
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

const RUNTIME_WRITE_MAX_RETRIES = 8;
const RUNTIME_WRITE_BASE_DELAY_MS = 50;
const RUNTIME_WRITE_TRANSACTION_MAX_WAIT_MS = 10_000;
const RUNTIME_WRITE_TRANSACTION_TIMEOUT_MS = 15_000;

function toRuntimeSession(row: {
  id: string;
  flavor: string;
  path: string;
  branch: string | null;
  status: string;
  approvalPolicy: string;
  model: string | null;
  metadata?: unknown;
  riskScore: number;
  updatedAt: Date;
}): RuntimeSession {
  const metadataRecord = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
    ? row.metadata as Record<string, unknown>
    : {};
  const runtimeModel = typeof metadataRecord.runtimeModel === 'string' && metadataRecord.runtimeModel.trim().length > 0
    ? metadataRecord.runtimeModel.trim()
    : undefined;
  return {
    id: row.id,
    metadata: {
      flavor: row.flavor as RuntimeSession['metadata']['flavor'],
      path: row.path,
      approvalPolicy: row.approvalPolicy as ApprovalPolicy,
      ...(row.model ? { model: row.model } : {}),
      ...(row.branch ? { branch: row.branch } : {}),
      ...(runtimeModel ? { runtimeModel } : {}),
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

function readRunLifecycleStatus(meta: unknown): 'run_started' | 'completed' | 'failed' | 'aborted' | null {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) {
    return null;
  }
  const record = meta as Record<string, unknown>;
  const status = typeof record.sessionTurnStatus === 'string'
    ? record.sessionTurnStatus.trim()
    : typeof record.runStatus === 'string'
      ? record.runStatus.trim()
      : '';
  if (status === 'run_started' || status === 'completed' || status === 'failed' || status === 'aborted') {
    return status;
  }
  return null;
}

function toSessionRunStatus(status: 'completed' | 'failed' | 'aborted'): 'completed' | 'failed' | 'aborted' {
  return status;
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

function toPermissionRequest(row: {
  id: string;
  sessionId: string;
  chatId: string | null;
  agent: string;
  command: string;
  reason: string;
  risk: string;
  state: string;
  decision?: string | null;
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
    ...(typeof row.decision === 'string' && row.decision.trim().length > 0
      ? { decision: row.decision as PermissionDecision }
      : {}),
  };
}

function getPrismaErrorCode(error: unknown): string | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const code = (error as { code?: unknown }).code;
  return typeof code === 'string' ? code : null;
}

function getErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) {
    return '';
  }
  return error.message.trim();
}

function isRetryableRuntimeWriteError(error: unknown): boolean {
  const code = getPrismaErrorCode(error);
  if (code === 'P2002' || code === 'P2034' || code === 'P2028') {
    return true;
  }

  const message = getErrorMessage(error);
  return (
    message.includes('TransactionWriteConflict')
    || message.includes('could not serialize access')
    || message.includes('serialization failure')
    || message.includes('deadlock detected')
    || message.includes('Unable to start a transaction in the given time')
    || message.includes('A commit cannot be executed on an expired transaction')
    || message.includes('Transaction already closed')
    || message.includes('Transaction API error')
  );
}

function retryDelay(attempt: number): Promise<void> {
  // Exponential backoff with jitter: base * 2^(attempt-1) + random jitter
  const base = RUNTIME_WRITE_BASE_DELAY_MS * (2 ** (attempt - 1));
  const jitter = Math.random() * base * 0.5;
  return new Promise((resolve) => setTimeout(resolve, base + jitter));
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

  private async runRuntimeWriteMutationWithRetry<T>(
    operation: (tx: Prisma.TransactionClient) => Promise<T>,
  ): Promise<T> {
    for (let attempt = 1; attempt <= RUNTIME_WRITE_MAX_RETRIES; attempt += 1) {
      try {
        return await this.db.$transaction(
          async (tx) => operation(tx),
          {
            isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
            maxWait: RUNTIME_WRITE_TRANSACTION_MAX_WAIT_MS,
            timeout: RUNTIME_WRITE_TRANSACTION_TIMEOUT_MS,
          },
        );
      } catch (error) {
        if (!isRetryableRuntimeWriteError(error) || attempt === RUNTIME_WRITE_MAX_RETRIES) {
          throw error;
        }
        await retryDelay(attempt);
      }
    }

    throw new Error('RUNTIME_WRITE_RETRY_EXHAUSTED');
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
        metadata: { runtimeModel: 'chat-stream' },
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

  async listChatEvents(
    chatId: string,
    options: { afterSeq?: number; limit?: number } = {},
  ): Promise<RuntimeMessage[]> {
    const afterSeq = Number.isFinite(options.afterSeq) ? Math.max(0, Math.floor(Number(options.afterSeq))) : 0;
    const db = this.db as any;
    const rows = await db.sessionChatEvent.findMany({
      where: { chatId, seq: { gt: afterSeq } },
      orderBy: { seq: 'asc' },
      ...(options.limit ? { take: options.limit } : {}),
    });

    return rows.map((row: {
      id: string;
      sessionId: string;
      chatId: string;
      runId?: string | null;
      type: string;
      title: string | null;
      text: string;
      meta: unknown;
      seq: number;
      createdAt: Date;
    }) => toRuntimeMessage({
      id: row.id,
      sessionId: row.sessionId,
      type: row.type,
      title: row.title,
      text: row.text,
      meta: {
        ...(row.meta && typeof row.meta === 'object' ? row.meta as Record<string, unknown> : {}),
        chatId: row.chatId,
        ...(row.runId ? { runId: row.runId } : {}),
      },
      seq: row.seq,
      createdAt: row.createdAt,
    }));
  }

  async appendChatEvent(
    chatId: string,
    input: {
      sessionId: string;
      runId?: string;
      type: string;
      title?: string;
      text: string;
      meta?: Record<string, unknown>;
    },
  ): Promise<RuntimeMessage> {
    const db = this.db as any;

    const chat = await db.sessionChat.findFirst({
      where: { id: chatId, sessionId: input.sessionId },
      select: { id: true, sessionId: true, latestPreview: true },
    });
    if (!chat) {
      throw new Error('CHAT_NOT_FOUND');
    }

    const row = await this.runRuntimeWriteMutationWithRetry(async (tx) => {
      let resolvedRunId = input.runId;
      const lifecycleStatus = readRunLifecycleStatus(input.meta);
      if (!resolvedRunId && lifecycleStatus === 'run_started') {
        const activeRun = await tx.sessionRun.findFirst({
          where: { chatId, status: 'running' },
          orderBy: { startedAt: 'desc' },
        });
        if (activeRun) {
          resolvedRunId = activeRun.id;
        } else {
          const createdRun = await tx.sessionRun.create({
            data: {
              sessionId: input.sessionId,
              chatId,
              agent: typeof input.meta?.agent === 'string' && input.meta.agent.trim().length > 0
                ? input.meta.agent.trim()
                : 'unknown',
              model: typeof input.meta?.model === 'string' && input.meta.model.trim().length > 0
                ? input.meta.model.trim()
                : null,
              status: 'running',
            },
          });
          resolvedRunId = createdRun.id;
        }
      } else if (!resolvedRunId && (
        lifecycleStatus === 'completed'
        || lifecycleStatus === 'failed'
        || lifecycleStatus === 'aborted'
      )) {
        const latestRun = await tx.sessionRun.findFirst({
          where: { chatId, status: 'running' },
          orderBy: { startedAt: 'desc' },
        });
        if (latestRun) {
          resolvedRunId = latestRun.id;
          await tx.sessionRun.update({
            where: { id: latestRun.id },
            data: {
              status: toSessionRunStatus(lifecycleStatus),
              finishedAt: new Date(),
            },
          });
        }
      }
      const agg = await tx.sessionChatEvent.aggregate({
        where: { chatId },
        _max: { seq: true },
      });
      const nextSeq = (agg._max.seq ?? 0) + 1;
      const created = await tx.sessionChatEvent.create({
        data: {
          id: randomUUID(),
          chatId,
          sessionId: input.sessionId,
          ...(resolvedRunId ? { runId: resolvedRunId } : {}),
          type: input.type,
          title: input.title ?? input.type,
          text: input.text,
          meta: (input.meta ?? {}) as Parameters<typeof tx.sessionChatEvent.create>[0]['data']['meta'],
          seq: nextSeq,
        },
      });
      await tx.sessionChat.update({
        where: { id: chatId },
        data: {
          latestPreview: input.text.slice(0, 280),
          latestEventId: created.id,
          latestEventAt: created.createdAt,
          latestEventIsUser: input.meta?.role === 'user',
          latestHasErrorSignal: Boolean(input.meta?.error),
          lastActivityAt: created.createdAt,
        },
      });
      return created;
    });

    return toRuntimeMessage({
      id: row.id,
      sessionId: row.sessionId,
      type: row.type,
      title: row.title,
      text: row.text,
      meta: {
        ...(row.meta && typeof row.meta === 'object' ? row.meta as Record<string, unknown> : {}),
        chatId: row.chatId,
        ...(row.runId ? { runId: row.runId } : {}),
      },
      seq: row.seq,
      createdAt: row.createdAt,
    });
  }

  async appendMessage(sessionId: string, input: AppendMessageInput): Promise<RuntimeMessage> {
    const session = await this.db.session.findUnique({ where: { id: sessionId } });
    if (!session) throw new Error('SESSION_NOT_FOUND');

    const isAgentMessage = input.meta?.role === 'agent';
    const isUserPrompt = input.type === 'message' && !isAgentMessage;

    const newStatus: SessionStatus = isUserPrompt ? 'running' : isAgentMessage ? 'idle' : (session.status as SessionStatus);

    const row = await this.runRuntimeWriteMutationWithRetry(async (tx) => {
      const agg = await tx.sessionMessage.aggregate({
        where: { sessionId },
        _max: { seq: true },
      });
      const nextSeq = (agg._max.seq ?? 0) + 1;

      const created = await tx.sessionMessage.create({
        data: {
          id: randomUUID(),
          sessionId,
          type: input.type,
          title: input.title ?? input.type,
          text: input.text,
          meta: (input.meta ?? {}) as Parameters<typeof tx.sessionMessage.create>[0]['data']['meta'],
          seq: nextSeq,
        },
      });

      await tx.session.update({
        where: { id: sessionId },
        data: { status: newStatus, updatedAt: new Date() },
      });

      return created;
    });

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

    await this.runRuntimeWriteMutationWithRetry(async (tx) => {
      const nextSeq = await tx.sessionMessage
        .aggregate({ where: { sessionId }, _max: { seq: true } })
        .then((a) => (a._max.seq ?? 0) + 1);

      await tx.session.update({
        where: { id: sessionId },
        data: { ...updates, updatedAt: new Date(at) },
      });

      await tx.sessionMessage.create({
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
          seq: nextSeq,
        },
      });
    });

    return { accepted: true, message: `${action.toUpperCase()} acknowledged`, at };
  }

  async isSessionRunning(sessionId: string, _chatId?: string): Promise<boolean> {
    const normalizedChatId = typeof _chatId === 'string' && _chatId.trim().length > 0
      ? _chatId.trim()
      : null;
    if (normalizedChatId) {
      const activeRun = await (this.db as any).sessionRun.findFirst({
        where: { sessionId, chatId: normalizedChatId, status: 'running' },
        select: { id: true },
      });
      return Boolean(activeRun);
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

  async getLatestUserMessageForAction(sessionId: string, chatId?: string): Promise<AppendMessageInput | null> {
    const normalizedChatId = typeof chatId === 'string' && chatId.trim().length > 0
      ? chatId.trim()
      : null;
    if (normalizedChatId) {
      const db = this.db as any;
      const row = await db.sessionChatEvent.findFirst({
        where: {
          sessionId,
          chatId: normalizedChatId,
          meta: {
            path: ['role'],
            equals: 'user',
          },
        },
        orderBy: { seq: 'desc' },
      });
      if (!row) {
        return null;
      }
      return {
        type: row.type,
        title: row.title ?? undefined,
        text: row.text,
        meta: {
          ...(row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta) ? row.meta as Record<string, unknown> : {}),
          chatId: row.chatId,
          ...(row.runId ? { runId: row.runId } : {}),
        },
      };
    }

    const row = await this.db.sessionMessage.findFirst({
      where: {
        sessionId,
        meta: {
          path: ['role'],
          equals: 'user',
        },
      },
      orderBy: { seq: 'desc' },
    });
    if (!row) {
      return null;
    }
    return {
      type: row.type,
      title: row.title ?? undefined,
      text: row.text,
      meta: row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
        ? row.meta as Record<string, unknown>
        : undefined,
    };
  }

  async getPermissionById(permissionId: string): Promise<PermissionRequest | null> {
    const row = await this.db.permission.findUnique({
      where: { id: permissionId },
    });
    return row ? toPermissionRequest(row) : null;
  }

  async hasRequestedAction(input: {
    sessionId: string;
    action: SessionAction;
    chatId?: string;
    createdAfter?: Date;
  }): Promise<boolean> {
    const normalizedChatId = typeof input.chatId === 'string' && input.chatId.trim().length > 0
      ? input.chatId.trim()
      : null;
    const createdAfter = input.createdAfter instanceof Date && Number.isFinite(input.createdAfter.getTime())
      ? input.createdAfter
      : null;
    const row = await this.db.sessionMessage.findFirst({
      where: {
        sessionId: input.sessionId,
        ...(createdAfter ? { createdAt: { gt: createdAfter } } : {}),
        ...(normalizedChatId
          ? {
              meta: {
                path: ['action'],
                equals: input.action,
              },
            }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      select: { id: true, meta: true },
    });

    if (!row) {
      return false;
    }

    const meta = row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta)
      ? row.meta as Record<string, unknown>
      : {};
    const action = typeof meta.action === 'string' ? meta.action.trim() : '';
    const chatId = typeof meta.chatId === 'string' ? meta.chatId.trim() : '';
    if (action !== input.action) {
      return false;
    }
    if (normalizedChatId && chatId !== normalizedChatId) {
      return false;
    }
    return true;
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
        decision: null,
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
        decision,
        decidedAt: new Date(),
      },
    });
    return toPermissionRequest(row);
  }

  resolveExecutionCwd(cwdHint?: string): string {
    return cwdHint ?? '';
  }
}
