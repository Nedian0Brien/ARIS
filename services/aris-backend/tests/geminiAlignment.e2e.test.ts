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

function createFakeGeminiStore(options: { emitAction?: boolean; emitCommentary?: boolean; requirePermission?: boolean } = {}) {
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

  (store as any).runGeminiAcpTurn = async (input: {
    session: {
      metadata: {
        path: string;
      };
    };
    preferredThreadId?: string;
    model?: string;
    onAction?: (action: {
      actionType: string;
      title: string;
      callId?: string;
      command?: string;
      path?: string;
      output?: string;
      additions: number;
      deletions: number;
      hasDiffSignal: boolean;
    }, meta: { threadId: string }) => Promise<void>;
    onPermission?: (request: {
      callId: string;
      approvalId?: string;
      command: string;
      reason: string;
      risk: 'low' | 'medium' | 'high';
    }, meta: { threadId: string }) => Promise<'allow_once' | 'allow_session' | 'deny'>;
    onText?: (event: {
      text: string;
      source: 'assistant' | 'result';
      phase?: 'commentary' | 'final';
      threadId?: string;
      itemId?: string;
      envelopes?: Array<Record<string, unknown>>;
    }, meta: { threadId: string }) => Promise<void>;
  }) => {
    expect(input.session.metadata.path).toBe('/workspace/ARIS');
    seenCommands.push([
      input.preferredThreadId ? '--resume' : '--new-session',
      ...(input.preferredThreadId ? [input.preferredThreadId] : []),
      ...(input.model ? ['-m', input.model] : []),
    ]);
    const turnNumber = seenCommands.length;
    if (turnNumber === 1) {
      expect(input.preferredThreadId).toBeUndefined();
    } else {
      expect(input.preferredThreadId).toBe('gemini-observed-thread');
    }

    if (options.emitCommentary) {
      await input.onText?.({
        text: '먼저 구조를 확인하겠습니다.',
        source: 'assistant',
        phase: 'commentary',
        threadId: 'gemini-observed-thread',
        itemId: `thought-${turnNumber}`,
        envelopes: [
          {
            kind: 'text',
            provider: 'gemini',
            source: 'assistant',
            sessionId: 'gemini-observed-thread',
            turnId: `turn-${turnNumber}`,
            itemId: `thought-${turnNumber}`,
            text: '먼저 구조를 확인하겠습니다.',
          },
        ],
      }, { threadId: 'gemini-observed-thread' });
    }

    if (options.requirePermission) {
      const decision = await input.onPermission?.({
        callId: `approval-${turnNumber}`,
        approvalId: `approval-${turnNumber}`,
        command: 'Run pwd',
        reason: 'Gemini ACP requested permission for execute execution.',
        risk: 'high',
      }, { threadId: 'gemini-observed-thread' });
      expect(decision).toBe('allow_once');
    }

    if (options.emitAction) {
      await input.onAction?.({
        actionType: 'file_read',
        title: 'File Read',
        callId: `call-${turnNumber}`,
        path: '/workspace/ARIS/README.md',
        output: `README body ${turnNumber}`,
        additions: 0,
        deletions: 0,
        hasDiffSignal: false,
      }, { threadId: 'gemini-observed-thread' });
    }

    await input.onText?.({
      text: turnNumber === 1 ? '첫 번째 Gemini 응답' : '두 번째 Gemini 응답',
      source: 'assistant',
      phase: 'final',
      threadId: 'gemini-observed-thread',
    }, { threadId: 'gemini-observed-thread' });

    return {
      output: turnNumber === 1 ? '첫 번째 Gemini 응답' : '두 번째 Gemini 응답',
      cwd: '/home/ubuntu/project/ARIS',
      inferredActions: [],
      streamedActionsPersisted: false,
      threadId: 'gemini-observed-thread',
      threadIdSource: turnNumber === 1 ? 'observed' : 'resume',
      protocolEnvelopes: [
        ...(options.emitCommentary
          ? [{
            kind: 'text' as const,
            provider: 'gemini' as const,
            source: 'assistant' as const,
            sessionId: 'gemini-observed-thread',
            turnId: `turn-${turnNumber}`,
            itemId: `thought-${turnNumber}`,
            text: '먼저 구조를 확인하겠습니다.',
          }]
          : []),
        ...(options.emitAction
          ? [{
            kind: 'tool-call-end' as const,
            provider: 'gemini' as const,
            source: 'tool' as const,
            sessionId: 'gemini-observed-thread',
            turnId: `turn-${turnNumber}`,
            toolCallId: `call-${turnNumber}`,
            toolName: 'file_read',
            stopReason: 'completed' as const,
          }]
          : []),
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

  return { store, seenCommands };
}

describe('gemini alignment E2E', () => {
  it('reuses the observed Gemini thread id across turns and preserves queue ordering', async () => {
    const { store, seenCommands } = createFakeGeminiStore();

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
      )).length >= 1,
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
      )).length >= 2,
    );

    const agentMessages = persistedMessages.filter((message) => (
      message.meta?.source === 'cli-agent'
      && (message.meta?.streamEvent === 'agent_stream_action' || message.meta?.streamEvent === 'agent_message')
    ));

    expect(seenCommands).toHaveLength(2);
    expect(agentMessages).toHaveLength(2);
    expect(agentMessages[0]?.text).toBe('첫 번째 Gemini 응답');
    expect(agentMessages[1]?.text).toBe('두 번째 Gemini 응답');
    expect(agentMessages[0]?.meta?.geminiSessionId).toBe('gemini-observed-thread');
    expect(agentMessages[1]?.meta?.geminiSessionId).toBe('gemini-observed-thread');
    expect(await store.isSessionRunning(session.id, 'chat-gemini')).toBe(false);
  });

  it('passes the chat-selected Gemini model through to the CLI command args', async () => {
    const { store, seenCommands } = createFakeGeminiStore();

    const session = await store.createSession({
      path: '/workspace/ARIS',
      flavor: 'gemini',
      approvalPolicy: 'on-request',
    });

    await store.appendMessage(session.id, {
      type: 'message',
      text: 'Gemini 모델 전달 검증',
      meta: {
        role: 'user',
        agent: 'gemini',
        chatId: 'chat-gemini-model',
        model: 'gemini-2.5-pro',
      },
    });

    await waitFor(
      async () => store.listMessages(session.id),
      (messages) => messages.some((message) => (
        message.meta?.source === 'cli-agent'
        && message.meta?.streamEvent === 'agent_message'
      )),
    );

    expect(seenCommands).toHaveLength(1);
    expect(seenCommands[0]).toContain('-m');
    expect(seenCommands[0]).toContain('gemini-2.5-pro');
  });

  it('passes auto-gemini-3 through to the CLI command args when selected', async () => {
    const { store, seenCommands } = createFakeGeminiStore();

    const session = await store.createSession({
      path: '/workspace/ARIS',
      flavor: 'gemini',
      approvalPolicy: 'on-request',
    });

    await store.appendMessage(session.id, {
      type: 'message',
      text: 'Gemini auto 모델 전달 검증',
      meta: {
        role: 'user',
        agent: 'gemini',
        chatId: 'chat-gemini-auto-model',
        model: 'auto-gemini-3',
      },
    });

    await waitFor(
      async () => store.listMessages(session.id),
      (messages) => messages.some((message) => (
        message.meta?.source === 'cli-agent'
        && message.meta?.streamEvent === 'agent_message'
      )),
    );

    expect(seenCommands).toHaveLength(1);
    expect(seenCommands[0]).toContain('-m');
    expect(seenCommands[0]).toContain('auto-gemini-3');
  });

  it('allows a Gemini chat override even when the parent session flavor differs', async () => {
    const { store, seenCommands } = createFakeGeminiStore();

    const session = await store.createSession({
      path: '/workspace/ARIS',
      flavor: 'codex',
      approvalPolicy: 'on-request',
    });

    await store.appendMessage(session.id, {
      type: 'message',
      text: 'Gemini 채팅 오버라이드 요청',
      meta: {
        role: 'user',
        agent: 'gemini',
        chatId: 'chat-mixed-agent',
      },
    });

    const persistedMessages = await waitFor(
      async () => store.listMessages(session.id),
      (messages) => messages.some((message) => (
        message.meta?.source === 'cli-agent'
        && message.meta?.streamEvent === 'agent_message'
      )),
    );

    expect(seenCommands).toHaveLength(1);
    expect(persistedMessages.some((message) => message.text.includes('Gemini runtime type guard failed'))).toBe(false);
    expect(persistedMessages.some((message) => message.text === '첫 번째 Gemini 응답')).toBe(true);
  });

  it('persists Gemini streamed tool actions before the final assistant text', async () => {
    const { store } = createFakeGeminiStore({ emitAction: true });

    const session = await store.createSession({
      path: '/workspace/ARIS',
      flavor: 'gemini',
      approvalPolicy: 'on-request',
    });

    await store.appendMessage(session.id, {
      type: 'message',
      text: 'README를 읽고 요약해줘',
      meta: {
        role: 'user',
        agent: 'gemini',
        chatId: 'chat-gemini-action',
      },
    });

    const persistedMessages = await waitFor(
      async () => store.listMessages(session.id),
      (messages) => messages.filter((message) => (
        message.meta?.source === 'cli-agent'
        && (message.meta?.streamEvent === 'agent_stream_action' || message.meta?.streamEvent === 'agent_message')
      )).length >= 2,
    );

    const agentMessages = persistedMessages.filter((message) => (
      message.meta?.source === 'cli-agent'
      && (message.meta?.streamEvent === 'agent_stream_action' || message.meta?.streamEvent === 'agent_message')
    ));

    expect(agentMessages).toHaveLength(2);
    expect(agentMessages[0]?.meta?.streamEvent).toBe('agent_stream_action');
    expect(agentMessages[0]?.meta?.actionType).toBe('file_read');
    expect(agentMessages[0]?.meta?.path).toBe('/workspace/ARIS/README.md');
    expect(agentMessages[1]?.meta?.streamEvent).toBe('agent_message');
    expect(agentMessages[1]?.text).toBe('첫 번째 Gemini 응답');
  });

  it('persists Gemini commentary before the final assistant text', async () => {
    const { store } = createFakeGeminiStore({ emitCommentary: true });

    const session = await store.createSession({
      path: '/workspace/ARIS',
      flavor: 'gemini',
      approvalPolicy: 'on-request',
    });

    await store.appendMessage(session.id, {
      type: 'message',
      text: '중간 생각과 최종 답변을 모두 보여줘',
      meta: {
        role: 'user',
        agent: 'gemini',
        chatId: 'chat-gemini-commentary',
      },
    });

    const persistedMessages = await waitFor(
      async () => store.listMessages(session.id),
      (messages) => messages.filter((message) => (
        message.meta?.source === 'cli-agent'
        && (
          message.meta?.streamEvent === 'agent_commentary'
          || message.meta?.streamEvent === 'agent_message'
        )
      )).length >= 2,
    );

    const agentMessages = persistedMessages.filter((message) => (
      message.meta?.source === 'cli-agent'
      && (
        message.meta?.streamEvent === 'agent_commentary'
        || message.meta?.streamEvent === 'agent_message'
      )
    ));

    expect(agentMessages).toHaveLength(2);
    expect(agentMessages[0]?.title).toBe('Commentary');
    expect(agentMessages[0]?.meta?.streamEvent).toBe('agent_commentary');
    expect(agentMessages[0]?.text).toBe('먼저 구조를 확인하겠습니다.');
    expect(agentMessages[1]?.meta?.streamEvent).toBe('agent_message');
    expect(agentMessages[1]?.text).toBe('첫 번째 Gemini 응답');
  });

  it('creates a Gemini permission request and resumes after approval', async () => {
    const { store } = createFakeGeminiStore({ requirePermission: true, emitAction: true });

    const session = await store.createSession({
      path: '/workspace/ARIS',
      flavor: 'gemini',
      approvalPolicy: 'on-request',
    });

    await store.appendMessage(session.id, {
      type: 'message',
      text: 'pwd를 실행해서 알려줘',
      meta: {
        role: 'user',
        agent: 'gemini',
        chatId: 'chat-gemini-permission',
      },
    });

    const pendingPermissions = await waitFor(
      async () => store.listPermissions('pending'),
      (permissions) => permissions.length === 1,
    );
    const permission = pendingPermissions[0];
    expect(permission?.command).toBe('Run pwd');
    expect(await store.isSessionRunning(session.id, 'chat-gemini-permission')).toBe(true);

    await store.decidePermission(permission!.id, 'allow_once');

    const persistedMessages = await waitFor(
      async () => store.listMessages(session.id),
      (messages) => messages.filter((message) => (
        message.meta?.source === 'cli-agent'
        && (message.meta?.streamEvent === 'agent_stream_action' || message.meta?.streamEvent === 'agent_message')
      )).length >= 2,
    );

    const agentMessages = persistedMessages.filter((message) => (
      message.meta?.source === 'cli-agent'
      && (message.meta?.streamEvent === 'agent_stream_action' || message.meta?.streamEvent === 'agent_message')
    ));

    expect(agentMessages[0]?.meta?.streamEvent).toBe('agent_stream_action');
    expect(agentMessages[1]?.meta?.streamEvent).toBe('agent_message');
    expect(await store.listPermissions('pending')).toHaveLength(0);
    expect(await store.isSessionRunning(session.id, 'chat-gemini-permission')).toBe(false);
  });
});
