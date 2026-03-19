import Fastify, { type FastifyRequest } from 'fastify';
import { z } from 'zod';
import { requireBearerToken } from './auth.js';
import { RuntimeStore } from './store.js';

type RequestBucket = {
  windowStartAt: number;
  count: number;
  lastSeenAt: number;
};

type ServerConfig = {
  HOST: string;
  PORT: number;
  RUNTIME_API_TOKEN: string;
  RUNTIME_BACKEND?: 'mock' | 'happy' | 'prisma';
  DATABASE_URL?: string;
  HAPPY_SERVER_URL?: string;
  HAPPY_SERVER_TOKEN?: string;
  DEFAULT_PROJECT_PATH: string;
  HOST_PROJECTS_ROOT?: string;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
};

const RATE_LIMIT_WINDOW_MS = 10_000;
const RATE_LIMIT_MAX_REQUESTS = 120;
const RATE_LIMIT_BUCKET_TTL_MULTIPLIER = 6;

function resolveRequestIp(request: FastifyRequest): string {
  const header = request.headers['x-forwarded-for'];
  if (typeof header === 'string' && header.trim().length > 0) {
    return header.split(',')[0].trim();
  }
  if (Array.isArray(header) && header.length > 0) {
    const first = typeof header[0] === 'string' ? header[0].trim() : '';
    if (first) {
      return first;
    }
  }

  return request.ip || 'unknown';
}

function isRateLimitedPath(path: string): boolean {
  return path.startsWith('/v1/') || path.startsWith('/v3/');
}

function getPathOnly(url: string): string {
  const index = url.indexOf('?');
  return index < 0 ? url : url.slice(0, index);
}

const createSessionSchema = z.object({
  path: z.string().min(1),
  flavor: z.enum(['codex', 'claude', 'gemini', 'unknown']),
  approvalPolicy: z.enum(['on-request', 'on-failure', 'never', 'yolo']).optional(),
  model: z.string().trim().min(1).max(120).optional(),
  status: z.enum(['running', 'idle', 'stopped', 'error', 'unknown']).optional(),
  riskScore: z.number().int().min(0).max(100).optional(),
});

const appendMessageSchema = z.object({
  type: z.string().min(1),
  title: z.string().min(1).optional(),
  text: z.string().min(1),
  meta: z.record(z.string(), z.unknown()).optional(),
});

type AppendMessageInput = z.infer<typeof appendMessageSchema>;

type HappyBridgeAppendMessage = {
  localId: string | null;
  content: string;
  input: {
    type: string;
    title?: string;
    text: string;
    meta?: Record<string, unknown>;
  };
};

const sessionActionSchema = z.object({
  action: z.enum(['abort', 'retry', 'kill', 'resume']),
  chatId: z.string().trim().min(1).optional(),
});

const createPermissionSchema = z.object({
  sessionId: z.string().min(1),
  chatId: z.string().trim().min(1).optional(),
  agent: z.enum(['codex', 'claude', 'gemini', 'unknown']),
  command: z.string().min(1),
  reason: z.string().min(1),
  risk: z.enum(['low', 'medium', 'high']),
});

const decidePermissionSchema = z.object({
  decision: z.enum(['allow_once', 'allow_session', 'deny']),
});

const HAPPY_BRIDGE_HEADER = 'x-aris-happy-bridge';
const HAPPY_SELF_REFERENCE_ERROR = 'HAPPY_SERVER_URL이 현재 aris-backend 자신을 가리켜 요청 루프가 발생했습니다. 외부 Happy 런타임 URL로 변경하거나 RUNTIME_BACKEND=mock으로 전환하세요.';

function toErrorMessage(error: unknown, fallback = 'Internal Server Error'): string {
  if (error instanceof Error) {
    const trimmed = error.message.trim();
    if (trimmed) {
      return trimmed;
    }
  }
  return fallback;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function parseHappyBridgeMessages(body: unknown): HappyBridgeAppendMessage[] | null {
  const record = asRecord(body);
  if (!record || !Array.isArray(record.messages)) {
    return null;
  }

  const parsed = record.messages.map((item) => {
    const messageRecord = asRecord(item);
    const content = typeof messageRecord?.content === 'string'
      ? messageRecord.content
      : '';
    if (!content.trim()) {
      return null;
    }

    let payload: Record<string, unknown>;
    try {
      const parsedContent = JSON.parse(content) as unknown;
      payload = asRecord(parsedContent) ?? {};
    } catch {
      return null;
    }

    const payloadMeta = asRecord(payload.meta) ?? undefined;
    const payloadRole = typeof payload.role === 'string' && payload.role.trim().length > 0
      ? payload.role.trim()
      : undefined;
    const mergedMeta = payloadRole
      ? { role: payloadRole, ...payloadMeta }
      : payloadMeta;
    const type = typeof payload.type === 'string' && payload.type.trim().length > 0
      ? payload.type.trim()
      : 'message';
    const title = typeof payload.title === 'string' && payload.title.trim().length > 0
      ? payload.title.trim()
      : undefined;
    const text = typeof payload.text === 'string'
      ? payload.text
      : '';
    const localId = typeof messageRecord?.localId === 'string' && messageRecord.localId.trim().length > 0
      ? messageRecord.localId.trim()
      : null;

    return {
      localId,
      content,
      input: {
        type,
        ...(title ? { title } : {}),
        text,
        ...(mergedMeta ? { meta: mergedMeta } : {}),
      },
    } satisfies HappyBridgeAppendMessage;
  });

  if (parsed.some((item) => item === null)) {
    return null;
  }

  return parsed as HappyBridgeAppendMessage[];
}

function toHappyBridgeMessage(
  message: {
    id: string;
    type: string;
    title: string;
    text: string;
    createdAt: string;
    meta?: Record<string, unknown>;
  },
  localId: string | null,
  content: string,
) {
  const seqRaw = message.meta?.seq;
  const seq = typeof seqRaw === 'number'
    ? seqRaw
    : Number.parseInt(String(seqRaw ?? ''), 10);
  const createdAt = Date.parse(message.createdAt);
  const createdAtMs = Number.isFinite(createdAt) ? createdAt : Date.now();

  return {
    id: message.id,
    seq: Number.isFinite(seq) ? seq : 0,
    localId,
    content,
    createdAt: createdAtMs,
    updatedAt: createdAtMs,
    type: message.type,
    title: message.title,
  };
}

export function buildServer(config: ServerConfig) {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  const store = new RuntimeStore(
    config.DEFAULT_PROJECT_PATH,
    config.RUNTIME_BACKEND,
    config.HAPPY_SERVER_URL,
    config.HAPPY_SERVER_TOKEN,
    config.HOST_PROJECTS_ROOT,
    config.DATABASE_URL,
    `http://127.0.0.1:${config.PORT}`,
    config.RUNTIME_API_TOKEN,
  );
  const rateLimitBuckets = new Map<string, RequestBucket>();

  const isRateLimitExceeded = (path: string, ip: string): boolean => {
    const now = Date.now();
    if (rateLimitBuckets.size > 2_000) {
      const staleBefore = now - RATE_LIMIT_WINDOW_MS * RATE_LIMIT_BUCKET_TTL_MULTIPLIER;
      for (const [key, bucket] of rateLimitBuckets.entries()) {
        if (bucket.lastSeenAt < staleBefore) {
          rateLimitBuckets.delete(key);
        }
      }
    }

    const key = `${ip}:${path}`;
    const bucket = rateLimitBuckets.get(key);
    if (!bucket) {
      rateLimitBuckets.set(key, {
        windowStartAt: now,
        count: 1,
        lastSeenAt: now,
      });
      return false;
    }

    if (now - bucket.windowStartAt >= RATE_LIMIT_WINDOW_MS) {
      bucket.windowStartAt = now;
      bucket.count = 1;
      bucket.lastSeenAt = now;
      return false;
    }

    bucket.count += 1;
    bucket.lastSeenAt = now;
    return bucket.count > RATE_LIMIT_MAX_REQUESTS;
  };

  app.addHook('onRequest', async (request, reply) => {
    const path = getPathOnly(request.url);
    if (path.startsWith('/health')) {
      return;
    }

    if (isRateLimitedPath(path) && isRateLimitExceeded(path, resolveRequestIp(request))) {
      reply.header('Retry-After', String(Math.ceil(RATE_LIMIT_WINDOW_MS / 1000)));
      return reply.code(429).send({
        error: '요청이 너무 빠릅니다. 잠시 후 다시 시도하세요.',
      });
    }

    if (config.RUNTIME_BACKEND === 'happy') {
      const bridgeHeader = request.headers[HAPPY_BRIDGE_HEADER];
      const isBridgeCall = Array.isArray(bridgeHeader)
        ? bridgeHeader.includes('1')
        : bridgeHeader === '1';
      if (isBridgeCall) {
        return reply.code(502).send({ error: HAPPY_SELF_REFERENCE_ERROR });
      }
    }

    if (isRateLimitedPath(path)) {
      await requireBearerToken(request, reply, config.RUNTIME_API_TOKEN);
      if (reply.sent) {
        return reply;
      }
    }
  });

  app.get('/health', async () => ({
    status: 'up',
    service: 'aris-backend',
    now: new Date().toISOString(),
  }));

  app.get('/v1/sessions', async (_request, reply) => {
    try {
      return {
        sessions: await store.listSessions(),
      };
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to list sessions');
      return reply.code(502).send({ error: message });
    }
  });

  app.get('/v1/sessions/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const session = await store.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      // Resolve host-side path for terminal access
      let hostPath = session.metadata.path;
      try {
        hostPath = store.resolveExecutionCwd(session.metadata.path);
      } catch {
        // Keep original path as fallback
      }

      return {
        session: {
          ...session,
          hostPath,
        },
      };
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to load session');
      return reply.code(502).send({ error: message });
    }
  });

  app.post('/v1/sessions', async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    try {
      const session = await store.createSession(parsed.data);
      return reply.code(201).send({ session });
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to create session');
      return reply.code(502).send({ error: message });
    }
  });

  app.post('/v1/sessions/:sessionId/actions', async (request, reply) => {
    const parsed = sessionActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const { sessionId } = request.params as { sessionId: string };
    try {
      const result = await store.applySessionAction(
        sessionId,
        parsed.data.action,
        parsed.data.chatId,
      );

      if (parsed.data.action === 'kill') {
        const remaining = await store.getSession(sessionId);
        if (remaining && config.RUNTIME_BACKEND === 'happy') {
          const happyServerUrl = config.HAPPY_SERVER_URL;
          if (!happyServerUrl) {
            throw new Error('HAPPY_SERVER_URL is required for kill fallback');
          }
          const deleteResponse = await fetch(
            `${happyServerUrl.replace(/\/+$/, '')}/v1/sessions/${encodeURIComponent(sessionId)}`,
            {
              method: 'DELETE',
              headers: {
                Authorization: `Bearer ${config.HAPPY_SERVER_TOKEN}`,
              },
            },
          );

          if (!deleteResponse.ok && deleteResponse.status !== 404) {
            const body = (await deleteResponse.text().catch(() => '')).trim();
            throw new Error(`Failed to hard-delete session (${deleteResponse.status}): ${body || deleteResponse.statusText}`);
          }
        }
      }

      return { result: { sessionId, action: parsed.data.action, ...result } };
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
        return reply.code(404).send({ error: 'Session not found' });
      }
      const message = toErrorMessage(error, 'Failed to apply session action');
      return reply.code(502).send({ error: message });
    }
  });

  app.get('/v1/sessions/:sessionId/runtime', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { chatId } = request.query as { chatId?: string };
    const normalizedChatId = typeof chatId === 'string' && chatId.trim().length > 0
      ? chatId.trim()
      : undefined;
    try {
      const isRunning = await store.isSessionRunning(sessionId, normalizedChatId);
      return { sessionId, isRunning };
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
        return reply.code(404).send({ error: 'Session not found' });
      }
      const message = toErrorMessage(error, 'Failed to read session runtime');
      return reply.code(502).send({ error: message });
    }
  });

  app.get('/v1/sessions/:sessionId/providers/gemini/capabilities', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    try {
      const capabilities = await store.getGeminiSessionCapabilities(sessionId);
      return { capabilities };
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
        return reply.code(404).send({ error: 'Session not found' });
      }
      const message = toErrorMessage(error, 'Failed to load Gemini capabilities');
      return reply.code(502).send({ error: message });
    }
  });

  app.get('/v1/sessions/:sessionId/realtime-events', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const query = request.query as {
        after_cursor?: string;
        limit?: string;
        chatId?: string;
      };
      const afterCursor = Number.isFinite(Number(query.after_cursor))
        ? Math.max(0, Math.floor(Number(query.after_cursor)))
        : 0;
      const limit = Number.isFinite(Number(query.limit))
        ? Math.max(1, Math.min(200, Math.floor(Number(query.limit))))
        : 100;
      const chatId = typeof query.chatId === 'string' && query.chatId.trim().length > 0
        ? query.chatId.trim()
        : undefined;
      const payload = await store.listRealtimeEvents(sessionId, {
        afterCursor,
        limit,
        chatId,
      });
      return payload;
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to list session realtime events');
      if (message.includes('SESSION_NOT_FOUND')) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      return reply.code(502).send({ error: message });
    }
  });

  app.get('/v3/sessions/:sessionId/messages', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const { after_seq, after_id, limit } = request.query as { after_seq?: string; after_id?: string; limit?: string };
      const session = await store.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const parsedAfterSeq = Number.parseInt(String(after_seq ?? ''), 10);
      const parsedLimit = Number.parseInt(String(limit ?? ''), 10);
      const afterSeq = Number.isFinite(parsedAfterSeq) && parsedAfterSeq >= 0
        ? parsedAfterSeq
        : undefined;
      const afterId = typeof after_id === 'string' && after_id ? after_id : undefined;
      const pageLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
        ? Math.min(1000, parsedLimit)
        : undefined;

      const readLimit = pageLimit ? pageLimit + 1 : undefined;
      const rawMessages = await store.listMessages(sessionId, {
        ...(afterId !== undefined ? { afterId } : afterSeq !== undefined ? { afterSeq } : {}),
        ...(readLimit !== undefined ? { limit: readLimit } : {}),
      });
      const hasMore = pageLimit ? rawMessages.length > pageLimit : undefined;
      const messages = pageLimit ? rawMessages.slice(0, pageLimit) : rawMessages;
      const lastSeq = messages.reduce((max, message) => {
        const seqRaw = (message.meta as { seq?: unknown } | undefined)?.seq;
        const seq = typeof seqRaw === 'number' ? seqRaw : Number.parseInt(String(seqRaw ?? ''), 10);
        if (!Number.isFinite(seq) || seq <= max) {
          return max;
        }
        return seq;
      }, 0);

      return {
        messages,
        ...(typeof hasMore === 'boolean' ? { hasMore } : {}),
        ...(lastSeq > 0 ? { lastSeq } : {}),
      };
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to list session messages');
      return reply.code(502).send({ error: message });
    }
  });

  app.post('/v3/sessions/:sessionId/messages', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const bridgeMessages = parseHappyBridgeMessages(request.body);
    if (bridgeMessages) {
      try {
        const createdMessages = [];
        for (const bridgeMessage of bridgeMessages) {
          const createdMessage = await store.appendMessage(sessionId, bridgeMessage.input);
          createdMessages.push(
            toHappyBridgeMessage(createdMessage, bridgeMessage.localId, bridgeMessage.content),
          );
        }

        return reply.code(201).send({ messages: createdMessages });
      } catch (error) {
        if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
          return reply.code(404).send({ error: 'Session not found' });
        }
        const message = toErrorMessage(error, 'Failed to append session message');
        return reply.code(502).send({ error: message });
      }
    }

    const parsed = appendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    try {
      const message = await store.appendMessage(sessionId, parsed.data);
      return reply.code(201).send({ message });
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
        return reply.code(404).send({ error: 'Session not found' });
      }
      const message = toErrorMessage(error, 'Failed to append session message');
      return reply.code(502).send({ error: message });
    }
  });

  app.get('/v1/permissions', async (request) => {
    const { state, sessionId, chatId, includeUnassigned } = request.query as {
      state?: 'pending' | 'approved' | 'denied';
      sessionId?: string;
      chatId?: string;
      includeUnassigned?: string;
    };
    const normalizedSessionId = typeof sessionId === 'string' && sessionId.trim().length > 0
      ? sessionId.trim()
      : undefined;
    const normalizedChatId = typeof chatId === 'string' && chatId.trim().length > 0
      ? chatId.trim()
      : undefined;
    const allowUnassigned = includeUnassigned === '1' || includeUnassigned === 'true';
    let permissions = await store.listPermissions(state);
    if (normalizedSessionId) {
      permissions = permissions.filter((permission) => permission.sessionId === normalizedSessionId);
    }
    if (normalizedChatId) {
      permissions = permissions.filter((permission) => {
        const permissionChatId = typeof permission.chatId === 'string' && permission.chatId.trim().length > 0
          ? permission.chatId.trim()
          : undefined;
        if (permissionChatId === normalizedChatId) {
          return true;
        }
        return allowUnassigned && !permissionChatId;
      });
    }
    return { permissions };
  });

  app.post('/v1/permissions', async (request, reply) => {
    const parsed = createPermissionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    try {
      const permission = await store.createPermission({
        ...parsed.data,
      });
      return reply.code(201).send({ permission });
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
        return reply.code(404).send({ error: 'Session not found' });
      }
      const message = toErrorMessage(error, 'Failed to create permission request');
      return reply.code(502).send({ error: message });
    }
  });

  app.post('/v1/permissions/:permissionId/decision', async (request, reply) => {
    const parsed = decidePermissionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const { permissionId } = request.params as { permissionId: string };

    try {
      const permission = await store.decidePermission(permissionId, parsed.data.decision);
      return { permission };
    } catch (error) {
      if (error instanceof Error && error.message === 'PERMISSION_NOT_FOUND') {
        return reply.code(404).send({ error: 'Permission not found' });
      }
      const message = toErrorMessage(error, 'Failed to process permission decision');
      return reply.code(502).send({ error: message });
    }
  });

  return app;
}
