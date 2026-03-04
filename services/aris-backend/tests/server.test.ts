import { describe, expect, it } from 'vitest';
import { buildServer } from '../src/server.js';

const TOKEN = 'test-runtime-token';

function authHeader() {
  return { authorization: `Bearer ${TOKEN}` };
}

describe('aris-backend API', () => {
  it('rejects unauthorized requests', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp/project',
      LOG_LEVEL: 'silent',
    });

    const response = await app.inject({ method: 'GET', url: '/v1/sessions' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('lists sessions and messages', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp/project',
      LOG_LEVEL: 'silent',
    });
    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/sessions',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        path: '/tmp/project',
        flavor: 'claude',
      }),
    });

    expect(createResponse.statusCode).toBe(201);

    const sessionsResponse = await app.inject({
      method: 'GET',
      url: '/v1/sessions',
      headers: authHeader(),
    });

    expect(sessionsResponse.statusCode).toBe(200);
    const payload = sessionsResponse.json() as { sessions: Array<{ id: string }> };
    expect(payload.sessions.length).toBe(1);

    const messagesResponse = await app.inject({
      method: 'GET',
      url: `/v3/sessions/${payload.sessions[0].id}/messages`,
      headers: authHeader(),
    });

    expect(messagesResponse.statusCode).toBe(200);
    const messagesPayload = messagesResponse.json() as { messages: unknown[] };
    expect(Array.isArray(messagesPayload.messages)).toBe(true);

    await app.close();
  });

  it('applies action and permission decision', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp/project',
      LOG_LEVEL: 'silent',
    });
    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/sessions',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        path: '/tmp/project',
        flavor: 'claude',
      }),
    });
    expect(createResponse.statusCode).toBe(201);

    const sessions = (await app.inject({
      method: 'GET',
      url: '/v1/sessions',
      headers: authHeader(),
    })).json() as { sessions: Array<{ id: string }> };
    expect(sessions.sessions.length).toBe(1);

    const permissionCreateResponse = await app.inject({
      method: 'POST',
      url: '/v1/permissions',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        sessionId: sessions.sessions[0].id,
        agent: 'claude',
        command: 'npm install sharp',
        reason: 'Native dependency for image pipeline',
        risk: 'medium',
      }),
    });
    expect(permissionCreateResponse.statusCode).toBe(201);
    const permission = permissionCreateResponse.json() as { permission: { id: string } };

    const actionResponse = await app.inject({
      method: 'POST',
      url: `/v1/sessions/${sessions.sessions[0].id}/actions`,
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: { action: 'retry' },
    });

    expect(actionResponse.statusCode).toBe(200);

    const permissions = (await app.inject({
      method: 'GET',
      url: '/v1/permissions?state=pending',
      headers: authHeader(),
    })).json() as { permissions: Array<{ id: string }> };

    expect(permissions.permissions.length).toBeGreaterThan(0);

    const decisionResponse = await app.inject({
      method: 'POST',
      url: `/v1/permissions/${permission.permission.id}/decision`,
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: { decision: 'allow_once' },
    });

    expect(decisionResponse.statusCode).toBe(200);
    await app.close();
  });
});
