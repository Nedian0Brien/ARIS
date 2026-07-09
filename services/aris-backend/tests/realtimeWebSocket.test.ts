import { AddressInfo } from 'node:net';
import { once } from 'node:events';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { buildServer } from '../src/server.js';

const TOKEN = 'test-runtime-token';

function authHeaders() {
  return {
    Authorization: `Bearer ${TOKEN}`,
    'Content-Type': 'application/json',
  };
}

async function waitForMessage<T>(
  ws: WebSocket,
  predicate: (message: T) => boolean,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error('timed out waiting for websocket message'));
    }, 2_000);

    const onMessage = (data: WebSocket.RawData) => {
      const parsed = JSON.parse(data.toString()) as T;
      if (!predicate(parsed)) {
        return;
      }
      cleanup();
      resolve(parsed);
    };

    const onError = (error: Error) => {
      cleanup();
      reject(error);
    };

    const cleanup = () => {
      clearTimeout(timeout);
      ws.off('message', onMessage);
      ws.off('error', onError);
    };

    ws.on('message', onMessage);
    ws.on('error', onError);
  });
}

describe('runtime realtime WebSocket channel', () => {
  let app: ReturnType<typeof buildServer>;
  let baseUrl = '';

  beforeEach(async () => {
    app = buildServer({
      HOST: '127.0.0.1',
      PORT: 0,
      RUNTIME_API_TOKEN: TOKEN,
      RUNTIME_BACKEND: 'mock',
      DEFAULT_PROJECT_PATH: '/workspace',
      LOG_LEVEL: 'silent',
    });
    await app.listen({ host: '127.0.0.1', port: 0 });
    const address = app.server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  afterEach(async () => {
    await app.close();
  });

  it('pushes mutation broadcasts to subscribed websocket clients', async () => {
    const createResponse = await fetch(`${baseUrl}/v1/projects`, {
      method: 'POST',
      headers: authHeaders(),
      body: JSON.stringify({
        path: '/workspace',
        flavor: 'codex',
      }),
    });
    const created = (await createResponse.json()) as { project: { id: string } };
    const sessionId = created.project.id;
    const ws = new WebSocket(
      `${baseUrl.replace('http:', 'ws:')}/v1/projects/${encodeURIComponent(sessionId)}/realtime-events/ws?chatId=chat-1`,
      { headers: { Authorization: `Bearer ${TOKEN}` } },
    );

    try {
      await once(ws, 'open');
      const broadcastPromise = waitForMessage<{
        type: string;
        event?: { text?: string };
        chatId?: string;
      }>(ws, (message) => message.type === 'event.appended');

      const appendResponse = await fetch(`${baseUrl}/v1/chats/chat-1/events`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify({
          projectId: sessionId,
          type: 'message',
          text: 'hello over websocket',
          meta: {
            role: 'user',
            chatId: 'chat-1',
          },
        }),
      });
      expect(appendResponse.status).toBe(201);

      const broadcast = await broadcastPromise;

      expect(broadcast.chatId).toBe('chat-1');
      expect(broadcast.event?.text).toBe('hello over websocket');
    } finally {
      ws.close();
    }
  });
});
