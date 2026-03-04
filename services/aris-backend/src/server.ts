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

  app.get('/v1/sessions', async () => ({
    sessions: await store.listSessions(),
  }));

  app.post('/v1/sessions', async (request, reply) => {
    const parsed = createSessionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const session = await store.createSession(parsed.data);
    return reply.code(201).send({ session });
  });

  app.post('/v1/sessions/:sessionId/actions', async (request, reply) => {
    const parsed = sessionActionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'Invalid request body' });
    }

    const { sessionId } = request.params as { sessionId: string };
    try {
      const result = await store.applySessionAction(sessionId, parsed.data.action);
      return { result: { sessionId, action: parsed.data.action, ...result } };
    } catch (error) {
      if (error instanceof Error && error.message === 'SESSION_NOT_FOUND') {
        return reply.code(404).send({ error: 'Session not found' });
      }
      throw error;
    }
  });

  app.get('/v3/sessions/:sessionId/messages', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const session = await store.getSession(sessionId);
    if (!session) {
      return reply.code(404).send({ error: 'Session not found' });
    }

    const messages = await store.listMessages(sessionId);
    return { messages };
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
      throw error;
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
      throw error;
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
      throw error;
    }
  });

  return app;
}
