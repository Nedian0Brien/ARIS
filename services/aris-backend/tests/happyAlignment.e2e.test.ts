import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { HappyRuntimeStore } from '../src/runtime/happyClient.js';
import type { PermissionRequest } from '../src/types.js';

type FakeHappySession = {
  id: string;
  metadata: string;
  createdAt: number;
  updatedAt: number;
};

type FakeHappyMessage = {
  id: string;
  seq: number;
  localId: string | null;
  content: unknown;
  createdAt: number;
  updatedAt: number;
};

async function waitFor<T>(read: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 3_000): Promise<T> {
  const startedAt = Date.now();
  for (;;) {
    const value = await read();
    if (predicate(value)) {
      return value;
    }
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error(`Timed out while waiting for E2E condition: ${JSON.stringify(value)}`);
    }
    await delay(25);
  }
}

describe('happy alignment E2E', () => {
  it('runs a remote Claude turn through permission wait, tool ordering, and final text persistence', async () => {
    const store = new HappyRuntimeStore({
      serverUrl: 'http://fake-happy',
      token: 'fake-token',
      workspaceRoot: '/workspace',
      hostProjectsRoot: '/home/ubuntu/project',
    });
    const fakeSessions = new Map<string, FakeHappySession>();
    const fakeMessages = new Map<string, FakeHappyMessage[]>();
    let sessionSequence = 0;
    let messageSequence = 0;

    (store as any).request = async (requestPath: string, init: RequestInit = {}) => {
      const url = new URL(requestPath, 'http://fake-happy');
      const method = (init.method ?? 'GET').toUpperCase();

      if (url.pathname === '/v1/sessions' && method === 'POST') {
        const body = JSON.parse(String(init.body ?? '{}')) as { metadata: string };
        const id = `session-${sessionSequence += 1}`;
        const now = Date.now();
        const session: FakeHappySession = {
          id,
          metadata: body.metadata,
          createdAt: now,
          updatedAt: now,
        };
        fakeSessions.set(id, session);
        fakeMessages.set(id, []);
        return { session };
      }

      if (url.pathname === '/v1/sessions' && method === 'GET') {
        return {
          sessions: [...fakeSessions.values()],
        };
      }

      const messageMatch = url.pathname.match(/^\/v3\/sessions\/([^/]+)\/messages$/);
      if (messageMatch && method === 'POST') {
        const sessionId = decodeURIComponent(messageMatch[1] || '');
        const posted = JSON.parse(String(init.body ?? '{}')) as {
          messages?: Array<{ localId?: string; content?: string }>;
        };
        const list = fakeMessages.get(sessionId);
        const session = fakeSessions.get(sessionId);
        if (!list || !session) {
          throw new Error('SESSION_NOT_FOUND');
        }
        const created = (posted.messages ?? []).map((item) => {
          const now = Date.now();
          return {
            id: `message-${messageSequence += 1}`,
            seq: list.length + 1,
            localId: item.localId ?? null,
            content: {
              t: 'json',
              c: String(item.content ?? ''),
            },
            createdAt: now,
            updatedAt: now,
          } satisfies FakeHappyMessage;
        });
        list.push(...created);
        session.updatedAt = created[created.length - 1]?.updatedAt ?? session.updatedAt;
        return { messages: created };
      }

      if (messageMatch && method === 'GET') {
        const sessionId = decodeURIComponent(messageMatch[1] || '');
        const list = fakeMessages.get(sessionId) ?? [];
        const afterSeq = Number(url.searchParams.get('after_seq') ?? '0');
        const limit = Number(url.searchParams.get('limit') ?? String(list.length || 1));
        const filtered = list.filter((item) => item.seq > afterSeq).slice(0, limit);
        return {
          messages: filtered,
          hasMore: afterSeq + filtered.length < list.length,
        };
      }

      throw new Error(`Unhandled fake happy request: ${method} ${requestPath}`);
    };

    (store as any).runAgentCommand = async (
      agent: string,
      _command: unknown,
      cwdHint?: string,
      _signal?: AbortSignal,
      handlers?: {
        onAction?: (action: Record<string, unknown>) => Promise<void>;
        onPermission?: (request: Record<string, unknown>) => Promise<'allow_once' | 'allow_session' | 'deny'>;
      },
    ) => {
      expect(agent).toBe('claude');
      expect(cwdHint).toBe('/workspace/ARIS');
      const decision = await handlers?.onPermission?.({
        callId: 'approval-e2e',
        approvalId: 'approval-e2e',
        command: 'npm install sharp',
        reason: 'Need approval for native dependency',
        risk: 'high',
      });
      expect(decision).toBe('allow_once');
      await handlers?.onAction?.({
        actionType: 'command_execution',
        title: 'Run command',
        callId: 'call-e2e',
        command: 'npm install sharp',
        output: 'added 1 package',
        additions: 0,
        deletions: 0,
        hasDiffSignal: false,
      });
      return {
        output: 'sharp installed',
        cwd: '/home/ubuntu/project/ARIS',
        inferredActions: [],
        streamedActionsPersisted: true,
        threadId: 'observed-e2e-session',
        protocolEnvelopes: [
          {
            kind: 'tool-call-end',
            provider: 'claude',
            source: 'tool',
            sessionId: 'observed-e2e-session',
            turnId: 'observed-e2e-session',
            toolCallId: 'call-e2e',
            toolName: 'command_execution',
            stopReason: 'completed',
          },
          {
            kind: 'text',
            provider: 'claude',
            source: 'assistant',
            sessionId: 'observed-e2e-session',
            turnId: 'observed-e2e-session',
            text: 'sharp installed',
          },
          {
            kind: 'turn-end',
            provider: 'claude',
            source: 'result',
            sessionId: 'observed-e2e-session',
            turnId: 'observed-e2e-session',
            threadId: 'observed-e2e-session',
            threadIdSource: 'observed',
            stopReason: 'completed',
          },
        ],
      };
    };

    const session = await store.createSession({
      path: '/workspace/ARIS',
      flavor: 'claude',
      approvalPolicy: 'on-request',
    });

    await store.appendMessage(session.id, {
      type: 'message',
      text: 'Install sharp and confirm completion',
      meta: {
        role: 'user',
        agent: 'claude',
        chatId: 'chat-e2e',
      },
    });

    const pendingPermissions = await waitFor(
      async () => store.listPermissions('pending'),
      (permissions) => permissions.length === 1,
    );
    const permission = pendingPermissions[0] as PermissionRequest;
    expect(permission.command).toBe('npm install sharp');
    expect(await store.isSessionRunning(session.id, 'chat-e2e')).toBe(true);

    await store.decidePermission(permission.id, 'allow_once');

    const persistedMessages = await waitFor(
      async () => store.listMessages(session.id),
      (messages) => messages.filter((message) => message.meta?.source === 'cli-agent').length >= 2,
    );
    const agentMessages = persistedMessages.filter((message) => message.meta?.source === 'cli-agent');

    expect(agentMessages).toHaveLength(2);
    expect(agentMessages[0]?.text).toContain('$ npm install sharp');
    expect(agentMessages[0]?.meta?.launchMode).toBe('remote');
    expect(agentMessages[1]?.text).toBe('sharp installed');
    expect(agentMessages[1]?.meta?.claudeSessionId).toBe('observed-e2e-session');
    expect(agentMessages[1]?.meta?.launchMode).toBe('remote');
    expect(await store.listPermissions('pending')).toHaveLength(0);
    expect(await store.isSessionRunning(session.id, 'chat-e2e')).toBe(false);
  });
});
