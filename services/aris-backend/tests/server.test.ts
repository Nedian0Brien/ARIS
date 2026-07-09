import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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

    const response = await app.inject({ method: 'GET', url: '/v1/projects' });
    expect(response.statusCode).toBe(401);
    await app.close();
  });

  it('lists projects and messages', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp/project',
      LOG_LEVEL: 'silent',
    });
    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        path: '/tmp/project',
        flavor: 'claude',
        model: 'claude-sonnet-4-6',
      }),
    });

    expect(createResponse.statusCode).toBe(201);
    const createPayload = createResponse.json() as {
      project: { metadata?: { model?: string } };
    };
    expect(createPayload.project.metadata?.model).toBe('claude-sonnet-4-6');

    const projectsResponse = await app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: authHeader(),
    });

    expect(projectsResponse.statusCode).toBe(200);
    const payload = projectsResponse.json() as {
      projects: Array<{ id: string; metadata?: { model?: string } }>;
    };
    expect(payload.projects.length).toBe(1);
    expect(payload.projects[0].metadata?.model).toBe('claude-sonnet-4-6');

    const messagesResponse = await app.inject({
      method: 'GET',
      url: `/v3/projects/${payload.projects[0].id}/messages`,
      headers: authHeader(),
    });

    expect(messagesResponse.statusCode).toBe(200);
    const messagesPayload = messagesResponse.json() as { messages: unknown[] };
    expect(Array.isArray(messagesPayload.messages)).toBe(true);

    await app.close();
  });

  it('returns a project creation error when branch worktree creation fails', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp/project',
      LOG_LEVEL: 'silent',
    });

    const response = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        path: '/tmp/project',
        flavor: 'codex',
        branch: 'parallel/fails',
      }),
    });

    expect(response.statusCode).toBe(502);
    expect((response.json() as { error?: string }).error).toContain('WORKTREE_CREATE_FAILED');

    const projectsResponse = await app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: authHeader(),
    });
    expect((projectsResponse.json() as { projects: unknown[] }).projects).toHaveLength(0);

    await app.close();
  });

  it('accepts happy bridge payloads on the messages endpoint', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp/project',
      LOG_LEVEL: 'silent',
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/projects',
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
    const sessionId = (createResponse.json() as { project: { id: string } }).project.id;

    const appendResponse = await app.inject({
      method: 'POST',
      url: `/v3/projects/${sessionId}/messages`,
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        messages: [
          {
            localId: 'local-agent-1',
            content: JSON.stringify({
              role: 'agent',
              type: 'message',
              title: 'Text Reply',
              text: 'OK',
              meta: {
                role: 'agent',
                chatId: 'chat-bridge-1',
              },
            }),
          },
        ],
      }),
    });

    expect(appendResponse.statusCode).toBe(201);
    const appendPayload = appendResponse.json() as {
      messages: Array<{ localId?: string | null }>;
    };
    expect(appendPayload.messages[0]?.localId).toBe('local-agent-1');

    const messagesResponse = await app.inject({
      method: 'GET',
      url: `/v3/projects/${sessionId}/messages?chatId=chat-bridge-1`,
      headers: authHeader(),
    });

    expect(messagesResponse.statusCode).toBe(200);
    const messagesPayload = messagesResponse.json() as {
      messages: Array<{ text?: string; meta?: { role?: string; chatId?: string } }>;
    };
    expect(messagesPayload.messages.some((message) => message.text === 'OK')).toBe(true);
    expect(messagesPayload.messages.some((message) => message.meta?.role === 'agent' && message.meta?.chatId === 'chat-bridge-1')).toBe(true);

    await app.close();
  });

  it('appends and lists chat-scoped events through dedicated chat routes', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp/project',
      LOG_LEVEL: 'silent',
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/projects',
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
    const sessionId = (createResponse.json() as { project: { id: string } }).project.id;

    const appendResponse = await app.inject({
      method: 'POST',
      url: '/v1/chats/chat-1/events',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        projectId: sessionId,
        runId: 'run-1',
        type: 'message',
        title: 'Text Reply',
        text: 'chat scoped',
        meta: { role: 'agent' },
      }),
    });

    expect(appendResponse.statusCode).toBe(201);
    const appendPayload = appendResponse.json() as { event?: { meta?: { seq?: number; chatId?: string } } };
    expect(appendPayload.event?.meta?.seq).toBe(1);
    expect(appendPayload.event?.meta?.chatId).toBe('chat-1');

    const listResponse = await app.inject({
      method: 'GET',
      url: '/v1/chats/chat-1/events?after_seq=0&limit=20',
      headers: authHeader(),
    });

    expect(listResponse.statusCode).toBe(200);
    const listPayload = listResponse.json() as { events?: Array<{ text?: string; meta?: { chatId?: string; seq?: number } }> };
    expect(listPayload.events).toEqual([
      expect.objectContaining({
        text: 'chat scoped',
        meta: expect.objectContaining({
          chatId: 'chat-1',
          seq: 1,
        }),
      }),
    ]);

    const compatResponse = await app.inject({
      method: 'GET',
      url: `/v3/projects/${sessionId}/messages?chatId=chat-1&after_seq=0&limit=20`,
      headers: authHeader(),
    });
    expect(compatResponse.statusCode).toBe(200);
    const compatPayload = compatResponse.json() as { messages?: Array<{ meta?: { chatId?: string; seq?: number } }> };
    expect(compatPayload.messages?.[0]?.meta?.chatId).toBe('chat-1');
    expect(compatPayload.messages?.[0]?.meta?.seq).toBe(1);

    await app.close();
  });

  it('submits user prompts through the explicit chat prompt route', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp/project',
      LOG_LEVEL: 'silent',
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/projects',
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
    const sessionId = (createResponse.json() as { project: { id: string } }).project.id;

    const promptResponse = await app.inject({
      method: 'POST',
      url: '/v1/chats/chat-1/user-prompts',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        projectId: sessionId,
        type: 'message',
        title: 'User Instruction',
        text: '구조를 올바르게 리팩토링해줘',
        meta: { role: 'user', agent: 'codex' },
      }),
    });

    expect(promptResponse.statusCode).toBe(201);
    const promptPayload = promptResponse.json() as { event?: { text?: string; meta?: { role?: string; chatId?: string } } };
    expect(promptPayload.event).toEqual(expect.objectContaining({
      text: '구조를 올바르게 리팩토링해줘',
      meta: expect.objectContaining({
        role: 'user',
        chatId: 'chat-1',
      }),
    }));

    await app.close();
  });

  it('runs terminal commands through a dedicated terminal command route', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp',
      LOG_LEVEL: 'silent',
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        path: '/tmp',
        flavor: 'claude',
      }),
    });
    expect(createResponse.statusCode).toBe(201);
    const sessionId = (createResponse.json() as { project: { id: string } }).project.id;

    const terminalResponse = await app.inject({
      method: 'POST',
      url: '/v1/chats/chat-1/terminal/commands',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        projectId: sessionId,
        command: 'printf aris-terminal',
      }),
    });

    expect(terminalResponse.statusCode).toBe(201);
    const terminalPayload = terminalResponse.json() as {
      events?: Array<{ text?: string; meta?: { role?: string; kind?: string; exitCode?: number; command?: string } }>;
    };
    expect(terminalPayload.events?.[0]).toEqual(expect.objectContaining({
      text: expect.stringContaining('aris-terminal'),
      meta: expect.objectContaining({
        role: 'terminal',
        kind: 'terminal_result',
        exitCode: 0,
        command: 'printf aris-terminal',
      }),
    }));

    await app.close();
  });

  it('executes terminal commands in a panel runtime session while recording events on the project chat', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp',
      LOG_LEVEL: 'silent',
    });
    const projectDir = await mkdtemp(join(tmpdir(), 'aris-project-'));
    const panelDir = await mkdtemp(join(tmpdir(), 'aris-panel-runtime-'));

    const projectResponse = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        path: projectDir,
        flavor: 'claude',
      }),
    });
    const runtimeResponse = await app.inject({
      method: 'POST',
      url: '/v1/projects',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        path: panelDir,
        flavor: 'claude',
      }),
    });
    expect(projectResponse.statusCode).toBe(201);
    expect(runtimeResponse.statusCode).toBe(201);
    const projectSessionId = (projectResponse.json() as { project: { id: string } }).project.id;
    const runtimeProjectId = (runtimeResponse.json() as { project: { id: string } }).project.id;

    const terminalResponse = await app.inject({
      method: 'POST',
      url: '/v1/chats/chat-1/terminal/commands',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        projectId: projectSessionId,
        runtimeProjectId,
        command: 'pwd',
      }),
    });

    expect(terminalResponse.statusCode).toBe(201);
    const terminalPayload = terminalResponse.json() as {
      events?: Array<{ projectId?: string; text?: string; meta?: { chatId?: string; runtimeProjectId?: string; execCwd?: string } }>;
    };
    expect(terminalPayload.events?.[0]).toEqual(expect.objectContaining({
      projectId: projectSessionId,
      text: expect.stringContaining(panelDir),
      meta: expect.objectContaining({
        chatId: 'chat-1',
        runtimeProjectId,
        execCwd: panelDir,
      }),
    }));

    await app.close();
  });

  it('returns Gemini capabilities even when the session flavor is not gemini', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp/project',
      LOG_LEVEL: 'silent',
    });

    const createResponse = await app.inject({
      method: 'POST',
      url: '/v1/projects',
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
    const sessionId = (createResponse.json() as { project: { id: string } }).project.id;

    const response = await app.inject({
      method: 'GET',
      url: `/v1/projects/${sessionId}/providers/gemini/capabilities`,
      headers: authHeader(),
    });

    expect(response.statusCode).toBe(200);
    const payload = response.json() as {
      capabilities?: {
        projectId?: string;
        modes?: { availableModes?: Array<{ id: string }> };
      };
    };
    expect(payload.capabilities?.projectId).toBe(sessionId);
    expect(Array.isArray(payload.capabilities?.modes?.availableModes)).toBe(true);
    await app.close();
  });

  it('returns 429 when API request frequency exceeds rate limit', async () => {
    const app = buildServer({
      RUNTIME_API_TOKEN: TOKEN,
      DEFAULT_PROJECT_PATH: '/tmp/project',
      LOG_LEVEL: 'silent',
    });

    const burstHeaders = {
      ...authHeader(),
      'x-forwarded-for': '203.0.113.5',
    };

    for (let i = 0; i < 120; i += 1) {
      const response = await app.inject({
        method: 'GET',
        url: '/v1/projects',
        headers: burstHeaders,
      });
      expect(response.statusCode).toBe(200);
    }

    const burstResponse = await app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: burstHeaders,
    });
    expect(burstResponse.statusCode).toBe(429);
    const payload = burstResponse.json() as { error?: string };
    expect(payload.error).toContain('요청이 너무 빠릅니다');
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
      url: '/v1/projects',
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

    const projects = (await app.inject({
      method: 'GET',
      url: '/v1/projects',
      headers: authHeader(),
    })).json() as { projects: Array<{ id: string }> };
    expect(projects.projects.length).toBe(1);

    const permissionCreateResponse = await app.inject({
      method: 'POST',
      url: '/v1/permissions',
      headers: {
        ...authHeader(),
        'content-type': 'application/json',
      },
      payload: JSON.stringify({
        projectId: projects.projects[0].id,
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
      url: `/v1/projects/${projects.projects[0].id}/actions`,
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

  // Two tests removed in 2.5b.1:
  // - 'blocks self-referential happy bridge requests with actionable error'
  // - 'returns 502 with error details when happy runtime credentials are missing'
  // Both required RUNTIME_BACKEND='happy', which no longer exists. The
  // self-reference guard targeted misconfigured happy backend recursion; in
  // prisma backend the runtimeExecutor self-fetches to 127.0.0.1:PORT by
  // design, so the guard was inapplicable.
});
