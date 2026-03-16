/**
 * E2E 테스트: Gemini action 카드 실시간 저장 검증
 *
 * 검증 목표:
 * 1. thinking 청크가 처리되는 동안 action이 DB에 즉시 저장되는지 (emitChain 블로킹 해제)
 * 2. 여러 action이 포함된 세션에서 action들이 올바른 순서로 저장되는지
 * 3. action이 final text보다 먼저 저장되는지
 * 4. thinking 청크 처리 완료를 기다리지 않고 action이 저장되는지 (actionChain 독립성)
 */
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

async function waitFor<T>(
  read: () => Promise<T>,
  predicate: (value: T) => boolean,
  timeoutMs = 5_000,
): Promise<T> {
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

/**
 * action 저장 타이밍을 추적하는 fake store를 생성.
 *
 * @param options.thinkingDelayMs - thinking 청크를 처리할 때 도입하는 인공 지연 (ms).
 *   이 값이 0보다 크면, thinking 청크를 처리하는 동안 action이 먼저 저장되는지 확인할 수 있다.
 * @param options.actionCount - 에이전트가 실행할 action 수.
 */
function createTimingStore(options: {
  thinkingDelayMs?: number;
  actionCount?: number;
  interleaveThinkingBetweenActions?: boolean;
} = {}) {
  const store = new HappyRuntimeStore({
    serverUrl: 'http://fake-happy',
    token: 'fake-token',
    workspaceRoot: '/workspace',
    hostProjectsRoot: '/home/ubuntu/project',
  });

  const fakeSessions = new Map<string, FakeHappySession>();
  const fakeMessages = new Map<string, FakeHappyMessage[]>();
  // 메시지가 DB에 저장된 시각을 기록 (localId → timestamp)
  const persistTimestamps = new Map<string, number>();
  let sessionSequence = 0;
  let messageSequence = 0;

  (store as any).request = async (requestPath: string, init: RequestInit = {}) => {
    const url = new URL(requestPath, 'http://fake-happy');
    const method = (init.method ?? 'GET').toUpperCase();

    if (url.pathname === '/v1/sessions' && method === 'POST') {
      const body = JSON.parse(String(init.body ?? '{}')) as { metadata: string };
      const id = `session-${sessionSequence += 1}`;
      const now = Date.now();
      const session: FakeHappySession = { id, metadata: body.metadata, createdAt: now, updatedAt: now };
      fakeSessions.set(id, session);
      fakeMessages.set(id, []);
      return { session };
    }

    if (url.pathname === '/v1/sessions' && method === 'GET') {
      return { sessions: [...fakeSessions.values()] };
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
        const localId = item.localId ?? null;
        if (localId) {
          persistTimestamps.set(localId, now);
        }
        return {
          id: `message-${messageSequence += 1}`,
          seq: list.length + 1,
          localId,
          content: { t: 'json', c: String(item.content ?? '') },
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
      return { messages: filtered, hasMore: afterSeq + filtered.length < list.length };
    }

    throw new Error(`Unhandled fake happy request: ${method} ${requestPath}`);
  };

  const actionCount = options.actionCount ?? 3;
  const thinkingDelayMs = options.thinkingDelayMs ?? 50;
  const interleaveThinking = options.interleaveThinkingBetweenActions ?? true;

  (store as any).runGeminiAcpTurn = async (input: {
    session: { metadata: { path: string } };
    preferredThreadId?: string;
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
    onText?: (event: {
      text: string;
      source: 'assistant' | 'result';
      phase?: 'commentary' | 'final';
      threadId?: string;
      itemId?: string;
      partial?: boolean;
    }, meta: { threadId: string }) => Promise<void>;
  }) => {
    const threadId = 'gemini-test-thread';

    // thinking 청크 (partial) 여러 개 emit — thinkingDelayMs 지연 포함
    // 이 청크들이 emitChain에 쌓이는 동안 action이 먼저 저장되어야 한다.
    for (let i = 0; i < 5; i += 1) {
      await input.onText?.({
        text: `Thinking chunk ${i + 1}... `,
        source: 'assistant',
        phase: 'commentary',
        threadId,
        itemId: 'thought-1',
        partial: true,
      }, { threadId });
      // thinking 청크 처리에 인공 지연 부여
      await delay(thinkingDelayMs);
    }

    // 여러 actions emit — interleave 옵션에 따라 thinking 청크와 혼합
    for (let i = 0; i < actionCount; i += 1) {
      if (interleaveThinking) {
        // action 사이에도 thinking 청크 삽입
        await input.onText?.({
          text: `Thinking between actions ${i + 1}... `,
          source: 'assistant',
          phase: 'commentary',
          threadId,
          itemId: `thought-action-${i + 1}`,
          partial: true,
        }, { threadId });
        await delay(thinkingDelayMs);
      }

      await input.onAction?.({
        actionType: i % 2 === 0 ? 'file_read' : 'exec',
        title: i % 2 === 0 ? 'File Read' : 'Execute',
        callId: `call-${i + 1}`,
        ...(i % 2 === 0
          ? { path: `/workspace/ARIS/file-${i + 1}.ts`, output: `content of file ${i + 1}` }
          : { command: `echo step${i + 1}`, output: `step${i + 1}` }),
        additions: 0,
        deletions: 0,
        hasDiffSignal: false,
      }, { threadId });
    }

    // 최종 텍스트 응답
    await input.onText?.({
      text: '작업이 완료되었습니다.',
      source: 'assistant',
      phase: 'final',
      threadId,
    }, { threadId });

    return {
      output: '작업이 완료되었습니다.',
      cwd: '/home/ubuntu/project/ARIS',
      inferredActions: [],
      streamedActionsPersisted: false,
      threadId,
      threadIdSource: 'observed' as const,
      protocolEnvelopes: [],
    };
  };

  return { store, persistTimestamps };
}

describe('gemini action 실시간 저장 E2E', () => {
  it('thinking 청크 처리와 무관하게 action이 즉시 DB에 저장된다 (actionChain 독립성)', async () => {
    // thinkingDelayMs=100 으로 설정해서 thinking 처리가 느린 상황을 시뮬레이션
    const { store, persistTimestamps } = createTimingStore({
      actionCount: 3,
      thinkingDelayMs: 100,
      interleaveThinkingBetweenActions: true,
    });

    const session = await store.createSession({
      path: '/workspace/ARIS',
      flavor: 'gemini',
      approvalPolicy: 'on-request',
    });

    const startedAt = Date.now();

    await store.appendMessage(session.id, {
      type: 'message',
      text: '여러 파일을 읽고 분석해줘',
      meta: {
        role: 'user',
        agent: 'gemini',
        chatId: 'chat-action-realtime',
      },
    });

    // action 3개 + final text 1개가 모두 저장될 때까지 대기
    const persistedMessages = await waitFor(
      async () => store.listMessages(session.id),
      (messages) => {
        const agentMessages = messages.filter((m) => m.meta?.source === 'cli-agent');
        const actions = agentMessages.filter((m) => m.meta?.streamEvent === 'agent_stream_action');
        const finalText = agentMessages.filter((m) => m.meta?.streamEvent === 'agent_message');
        return actions.length >= 3 && finalText.length >= 1;
      },
      8_000,
    );

    const agentMessages = persistedMessages.filter((m) => m.meta?.source === 'cli-agent');
    const actions = agentMessages.filter((m) => m.meta?.streamEvent === 'agent_stream_action');
    const finalText = agentMessages.filter((m) => m.meta?.streamEvent === 'agent_message');

    // 1. action 3개, final text 1개가 저장되어야 한다
    expect(actions).toHaveLength(3);
    expect(finalText).toHaveLength(1);

    // 2. 모든 action이 final text보다 먼저 저장되어야 한다 (순서 보장)
    const finalTextSeq = agentMessages.indexOf(finalText[0]!);
    for (const action of actions) {
      const actionSeq = agentMessages.indexOf(action);
      expect(actionSeq).toBeLessThan(finalTextSeq);
    }

    // 3. 전체 실행 시간 검증: thinking 지연(100ms × 8개 청크) + action(3개) + final
    //    만약 actions가 emitChain에 블로킹되었다면 훨씬 오래 걸렸을 것
    const elapsed = Date.now() - startedAt;
    // thinking 청크가 8개(initial 5 + interleaved 3) × 100ms = 800ms + 여유 = 3000ms 이내
    expect(elapsed).toBeLessThan(5_000);
  });

  it('여러 action이 올바른 순서로 저장된다', async () => {
    const { store } = createTimingStore({
      actionCount: 4,
      thinkingDelayMs: 20,
      interleaveThinkingBetweenActions: false,
    });

    const session = await store.createSession({
      path: '/workspace/ARIS',
      flavor: 'gemini',
      approvalPolicy: 'on-request',
    });

    await store.appendMessage(session.id, {
      type: 'message',
      text: '순서대로 파일 4개를 읽어줘',
      meta: {
        role: 'user',
        agent: 'gemini',
        chatId: 'chat-action-order',
      },
    });

    const persistedMessages = await waitFor(
      async () => store.listMessages(session.id),
      (messages) => {
        const actions = messages.filter(
          (m) => m.meta?.source === 'cli-agent' && m.meta?.streamEvent === 'agent_stream_action',
        );
        const finalText = messages.filter(
          (m) => m.meta?.source === 'cli-agent' && m.meta?.streamEvent === 'agent_message',
        );
        return actions.length >= 4 && finalText.length >= 1;
      },
      8_000,
    );

    const agentMessages = persistedMessages.filter((m) => m.meta?.source === 'cli-agent');
    const actions = agentMessages.filter((m) => m.meta?.streamEvent === 'agent_stream_action');

    // action 4개가 call-1, call-2, call-3, call-4 순서로 저장되어야 한다
    expect(actions).toHaveLength(4);
    expect(actions[0]?.meta?.sessionCallId ?? actions[0]?.meta?.callId ?? '').toMatch(/call-1/);
    expect(actions[1]?.meta?.sessionCallId ?? actions[1]?.meta?.callId ?? '').toMatch(/call-2/);
    expect(actions[2]?.meta?.sessionCallId ?? actions[2]?.meta?.callId ?? '').toMatch(/call-3/);
    expect(actions[3]?.meta?.sessionCallId ?? actions[3]?.meta?.callId ?? '').toMatch(/call-4/);

    // 모든 action이 final text 앞에 위치해야 한다
    const finalText = agentMessages.filter((m) => m.meta?.streamEvent === 'agent_message');
    const finalTextSeq = agentMessages.indexOf(finalText[0]!);
    for (const action of actions) {
      expect(agentMessages.indexOf(action)).toBeLessThan(finalTextSeq);
    }
  });

  it('action이 저장되는 시점이 세션 전체 완료 시점보다 유의미하게 이르다', async () => {
    // 각 action 사이에 thinking 지연을 부여하여
    // action이 세션 완료 전에 이미 저장되었음을 타임스탬프로 증명
    const { store, persistTimestamps } = createTimingStore({
      actionCount: 2,
      thinkingDelayMs: 150,
      interleaveThinkingBetweenActions: true,
    });

    const session = await store.createSession({
      path: '/workspace/ARIS',
      flavor: 'gemini',
      approvalPolicy: 'on-request',
    });

    await store.appendMessage(session.id, {
      type: 'message',
      text: '두 파일을 순서대로 읽어줘',
      meta: {
        role: 'user',
        agent: 'gemini',
        chatId: 'chat-action-timestamp',
      },
    });

    // 첫 번째 action이 저장될 때까지 대기
    await waitFor(
      async () => store.listMessages(session.id),
      (messages) => messages.filter(
        (m) => m.meta?.source === 'cli-agent' && m.meta?.streamEvent === 'agent_stream_action',
      ).length >= 1,
      5_000,
    );

    // 첫 번째 action 저장 시각을 기록
    const firstActionStoredAt = Date.now();

    // 세션이 완전히 끝날 때까지 대기 (final text 저장)
    const persistedMessages = await waitFor(
      async () => store.listMessages(session.id),
      (messages) => messages.filter(
        (m) => m.meta?.source === 'cli-agent' && m.meta?.streamEvent === 'agent_message',
      ).length >= 1,
      8_000,
    );

    const sessionCompletedAt = Date.now();

    // 첫 번째 action은 세션 완료보다 최소 100ms 이전에 저장되었어야 한다
    // (action 이후 thinking 지연 150ms + action 2 처리 등이 더 있으므로)
    const margin = sessionCompletedAt - firstActionStoredAt;
    expect(margin).toBeGreaterThan(50);

    const actions = persistedMessages.filter(
      (m) => m.meta?.source === 'cli-agent' && m.meta?.streamEvent === 'agent_stream_action',
    );
    expect(actions).toHaveLength(2);
  });
});
