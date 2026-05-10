import type { IncomingMessage } from 'node:http';
import type { Duplex } from 'node:stream';
import type { FastifyInstance } from 'fastify';
import { WebSocket, WebSocketServer } from 'ws';
import type {
  RuntimeRealtimeChannelEvent,
  RuntimeRealtimeChannelFilter,
  RuntimeStore,
} from '../store.js';

type UpgradeContext = RuntimeRealtimeChannelFilter;

const HEARTBEAT_INTERVAL_MS = 15_000;

function parseUpgradeContext(url: string | undefined): UpgradeContext | null {
  const parsed = new URL(url ?? '/', 'http://localhost');
  const match = parsed.pathname.match(/^\/v1\/sessions\/([^/]+)\/realtime-events\/ws$/);
  if (!match) {
    return null;
  }
  const sessionId = decodeURIComponent(match[1] ?? '').trim();
  if (!sessionId) {
    return null;
  }
  const chatIdRaw = parsed.searchParams.get('chatId');
  const chatId = typeof chatIdRaw === 'string' && chatIdRaw.trim().length > 0
    ? chatIdRaw.trim()
    : undefined;
  const includeUnassignedRaw = parsed.searchParams.get('includeUnassigned');
  const includeUnassigned = includeUnassignedRaw === '1' || includeUnassignedRaw === 'true';
  return {
    sessionId,
    ...(chatId ? { chatId } : {}),
    ...(includeUnassigned ? { includeUnassigned } : {}),
  };
}

function isAuthorizedUpgrade(request: IncomingMessage, token: string): boolean {
  const header = request.headers.authorization;
  const auth = Array.isArray(header) ? header[0] : header;
  if (auth === `Bearer ${token}`) {
    return true;
  }
  const parsed = new URL(request.url ?? '/', 'http://localhost');
  return parsed.searchParams.get('token') === token;
}

function rejectUpgrade(socket: Duplex, status: 400 | 401 | 404): void {
  const statusText = status === 401
    ? 'Unauthorized'
    : status === 404
      ? 'Not Found'
      : 'Bad Request';
  socket.write(`HTTP/1.1 ${status} ${statusText}\r\n\r\n`);
  socket.destroy();
}

function sendJson(ws: WebSocket, payload: unknown): void {
  if (ws.readyState !== WebSocket.OPEN) {
    return;
  }
  ws.send(JSON.stringify(payload));
}

export function installRuntimeRealtimeWebSocketGateway(
  app: FastifyInstance,
  store: RuntimeStore,
  token: string,
): void {
  const wss = new WebSocketServer({ noServer: true });
  const heartbeatTimers = new WeakMap<WebSocket, NodeJS.Timeout>();

  wss.on('connection', (ws: WebSocket, _request: IncomingMessage, context: UpgradeContext) => {
    sendJson(ws, {
      type: 'ready',
      sessionId: context.sessionId,
      ...(context.chatId ? { chatId: context.chatId } : {}),
      now: new Date().toISOString(),
    });

    const unsubscribe = store.subscribeRealtimeChannel(context, (event: RuntimeRealtimeChannelEvent) => {
      sendJson(ws, event);
    });

    const heartbeat = setInterval(() => {
      sendJson(ws, { type: 'heartbeat', now: new Date().toISOString() });
    }, HEARTBEAT_INTERVAL_MS);
    heartbeat.unref();
    heartbeatTimers.set(ws, heartbeat);

    ws.on('close', () => {
      unsubscribe();
      clearInterval(heartbeat);
      heartbeatTimers.delete(ws);
    });
  });

  app.server.on('upgrade', (request, socket, head) => {
    const context = parseUpgradeContext(request.url);
    if (!context) {
      return;
    }
    if (!token || !isAuthorizedUpgrade(request, token)) {
      rejectUpgrade(socket, 401);
      return;
    }
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request, context);
    });
  });

  app.addHook('onClose', (_instance, done) => {
    for (const client of wss.clients) {
      const heartbeat = heartbeatTimers.get(client);
      if (heartbeat) {
        clearInterval(heartbeat);
      }
      client.close(1001, 'server closing');
    }
    wss.close(() => done());
  });
}
