import { setTimeout as delay } from 'node:timers/promises';
import { describe, expect, it } from 'vitest';
import { HappyRuntimeStore } from '../src/runtime/happyClient.js';

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

describe('gemini alignment E2E', () => {
  it('reuses the observed Gemini thread id across turns and preserves queue ordering', async () => {
    const store = new HappyRuntimeStore({
      serverUrl: 'http://fake-happy',
      token: 'fake-token',
      workspaceRoot: '/workspace',
      hostProjectsRoot: '/home/ubuntu/project',
    });
    const fakeSessions = new Map<string, FakeHappySession>();
    const fakeMessages = new Map<string, FakeHappyMessage[]>();
    const seenCommands: string[][] = [];
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
      command: { args?: string[] },
      cwdHint?: string,
    ) => {
      expect(agent).toBe('gemini');
      expect(cwdHint).toBe('/workspace/ARIS');
      seenCommands.push([...(command.args ?? [])]);
      const turnNumber = seenCommands.length;
      if (turnNumber === 1) {
        expect(command.args ?? []).not.toContain('--resume');
      } else {
        expect(command.args ?? []).toContain('--resume');
        expect(command.args ?? []).toContain('gemini-observed-thread');
      }

      return {
        output: turnNumber === 1 ? '첫 번째 Gemini 응답' : '두 번째 Gemini 응답',
        cwd: '/home/ubuntu/project/ARIS',
        inferredActions: [
          {
            actionType: 'command_execution',
            title: 'Run command',
            callId: `call-gemini-${turnNumber}`,
            command: 'pwd',
            output: '/workspace/ARIS',
            additions: 0,
            deletions: 0,
            hasDiffSignal: false,
          },
        ],
        streamedActionsPersisted: false,
        threadId: 'gemini-observed-thread',
        protocolEnvelopes: [
          {
            kind: 'tool-call-end',
            provider: 'gemini',
            source: 'tool',
            sessionId: 'gemini-observed-thread',
            turnId: `turn-${turnNumber}`,
            toolCallId: `call-gemini-${turnNumber}`,
            toolName: 'command_execution',
            stopReason: 'completed',
          },
          {
            kind: 'text',
            provider: 'gemini',
            source: 'assistant',
            sessionId: 'gemini-observed-thread',
            turnId: `turn-${turnNumber}`,
            text: turnNumber === 1 ? '첫 번째 Gemini 응답' : '두 번째 Gemini 응답',
          },
          {
            kind: 'turn-end',
            provider: 'gemini',
            source: 'result',
            sessionId: 'gemini-observed-thread',
            turnId: `turn-${turnNumber}`,
            threadId: 'gemini-observed-thread',
            threadIdSource: 'observed',
            stopReason: 'completed',
          },
        ],
      };
    };

    const session = await store.createSession({
      path: '/workspace/ARIS',
      flavor: 'gemini',
      approvalPolicy: 'on-request',
    });

    await store.appendMessage(session.id, {
      type: 'message',
      text: '첫 번째 Gemini 요청',
      meta: {
        role: 'user',
        agent: 'gemini',
        chatId: 'chat-gemini',
      },
    });

    await waitFor(
      async () => store.listMessages(session.id),
      (messages) => messages.filter((message) => (
        message.meta?.source === 'cli-agent'
        && (message.meta?.streamEvent === 'agent_stream_action' || message.meta?.streamEvent === 'agent_message')
      )).length >= 2,
    );

    await store.appendMessage(session.id, {
      type: 'message',
      text: '두 번째 Gemini 요청',
      meta: {
        role: 'user',
        agent: 'gemini',
        chatId: 'chat-gemini',
      },
    });

    const persistedMessages = await waitFor(
      async () => store.listMessages(session.id),
      (messages) => messages.filter((message) => (
        message.meta?.source === 'cli-agent'
        && (message.meta?.streamEvent === 'agent_stream_action' || message.meta?.streamEvent === 'agent_message')
      )).length >= 4,
    );

    const agentMessages = persistedMessages.filter((message) => (
      message.meta?.source === 'cli-agent'
      && (message.meta?.streamEvent === 'agent_stream_action' || message.meta?.streamEvent === 'agent_message')
    ));

    expect(seenCommands).toHaveLength(2);
    expect(agentMessages).toHaveLength(4);
    expect(agentMessages[0]?.text).toContain('$ pwd');
    expect(agentMessages[1]?.text).toBe('첫 번째 Gemini 응답');
    expect(agentMessages[2]?.text).toContain('$ pwd');
    expect(agentMessages[3]?.text).toBe('두 번째 Gemini 응답');
    expect(agentMessages[1]?.meta?.geminiSessionId).toBe('gemini-observed-thread');
    expect(agentMessages[3]?.meta?.geminiSessionId).toBe('gemini-observed-thread');
    expect(await store.isSessionRunning(session.id, 'chat-gemini')).toBe(false);
  });
});
