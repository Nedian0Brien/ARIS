import Fastify from 'fastify';
import { z } from 'zod';
import { requireBearerToken } from './auth.js';
import { RuntimeStore } from './store.js';

type ServerConfig = {
  RUNTIME_API_TOKEN: string;
  RUNTIME_BACKEND?: 'mock' | 'happy';
  HAPPY_SERVER_URL?: string;
  HAPPY_SERVER_TOKEN?: string;
  DEFAULT_PROJECT_PATH: string;
  HOST_PROJECTS_ROOT?: string;
  LOG_LEVEL: 'fatal' | 'error' | 'warn' | 'info' | 'debug' | 'trace' | 'silent';
};

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

const sessionActionSchema = z.object({
  action: z.enum(['abort', 'retry', 'kill', 'resume']),
});

const createPermissionSchema = z.object({
  sessionId: z.string().min(1),
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

export function buildServer(config: ServerConfig) {
  const app = Fastify({ logger: { level: config.LOG_LEVEL } });
  const store = new RuntimeStore(
    config.DEFAULT_PROJECT_PATH,
    config.RUNTIME_BACKEND,
    config.HAPPY_SERVER_URL,
    config.HAPPY_SERVER_TOKEN,
    config.HOST_PROJECTS_ROOT,
  );

  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/health')) {
      return;
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

    if (request.url.startsWith('/v1/') || request.url.startsWith('/v3/')) {
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
      const result = await store.applySessionAction(sessionId, parsed.data.action);

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

  app.get('/v3/sessions/:sessionId/messages', async (request, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };
      const session = await store.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }

      const messages = await store.listMessages(sessionId);
      return { messages };
    } catch (error) {
      const message = toErrorMessage(error, 'Failed to list session messages');
      return reply.code(502).send({ error: message });
    }
  });

  app.post('/v3/sessions/:sessionId/messages', async (request, reply) => {
    const parsed = appendMessageSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const { sessionId } = request.params as { sessionId: string };

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
    const { state } = request.query as { state?: 'pending' | 'approved' | 'denied' };
    return { permissions: await store.listPermissions(state) };
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
