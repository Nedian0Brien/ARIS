import { describe, expect, it, vi } from 'vitest';
import {
  PrismaRuntimeStore,
  filterRealtimeRowsByChat,
  resolveChatRunningState,
} from '../src/runtime/prismaStore.js';

function buildStoreWithMockDb(db: Record<string, unknown>): PrismaRuntimeStore {
  const store = Object.create(PrismaRuntimeStore.prototype) as PrismaRuntimeStore & {
    db: Record<string, unknown>;
  };
  store.db = db;
  return store;
}

describe('filterRealtimeRowsByChat', () => {
  it('returns only rows for the requested chat id', () => {
    const rows = [
      { meta: { chatId: 'chat-old' }, seq: 1 },
      { meta: { chatId: 'chat-new' }, seq: 2 },
      { meta: { chatId: 'chat-old' }, seq: 3 },
    ];

    expect(filterRealtimeRowsByChat(rows, 'chat-new')).toEqual([
      { meta: { chatId: 'chat-new' }, seq: 2 },
    ]);
  });

  it('returns all rows when no chat id is requested', () => {
    const rows = [
      { meta: { chatId: 'chat-old' }, seq: 1 },
      { meta: { chatId: 'chat-new' }, seq: 2 },
    ];

    expect(filterRealtimeRowsByChat(rows)).toEqual(rows);
  });
});

describe('resolveChatRunningState', () => {
  it('treats the latest user message for the chat as running', () => {
    const rows = [
      { meta: { chatId: 'chat-a', role: 'agent' } },
      { meta: { chatId: 'chat-b', role: 'user' } },
      { meta: { chatId: 'chat-a', role: 'user' } },
    ];

    expect(resolveChatRunningState(rows, 'chat-a')).toBe(true);
  });

  it('treats abort action for the chat as idle', () => {
    const rows = [
      { meta: { chatId: 'chat-a', role: 'user' } },
      { meta: { chatId: 'chat-a', system: true, action: 'abort' } },
    ];

    expect(resolveChatRunningState(rows, 'chat-a')).toBe(false);
  });
});

describe('PrismaRuntimeStore.appendMessage', () => {
  it('retries when the next seq collides with an existing message in the same session', async () => {
    const aggregate = vi.fn()
      .mockResolvedValueOnce({ _max: { seq: 1 } })
      .mockResolvedValueOnce({ _max: { seq: 2 } });
    const create = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('duplicate seq'), { code: 'P2002' }))
      .mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'message-2',
        sessionId: data.sessionId,
        type: data.type,
        title: data.title,
        text: data.text,
        meta: data.meta,
        seq: data.seq,
        createdAt: new Date('2026-04-11T00:00:00.000Z'),
      }));
    const update = vi.fn().mockResolvedValue({ id: 'session-1', status: 'idle' });
    const session = {
      findUnique: vi.fn().mockResolvedValue({ id: 'session-1', status: 'idle' }),
      update,
    };
    const sessionMessage = {
      aggregate,
      create,
    };
    const db = {
      session,
      sessionMessage,
      $transaction: vi.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return input({ session, sessionMessage });
        }
        return Promise.all(input as Promise<unknown>[]);
      }),
    };
    const store = buildStoreWithMockDb(db);

    const message = await store.appendMessage('session-1', {
      type: 'message',
      title: 'Text Reply',
      text: '조사 중입니다.',
      meta: { role: 'agent' },
    });

    expect(message.meta?.seq).toBe(3);
    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
  });

  it('retries when the database surfaces TransactionWriteConflict without a Prisma error code', async () => {
    const aggregate = vi.fn()
      .mockResolvedValueOnce({ _max: { seq: 1 } })
      .mockResolvedValueOnce({ _max: { seq: 1 } });
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('TransactionWriteConflict'))
      .mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'message-2',
        sessionId: data.sessionId,
        type: data.type,
        title: data.title,
        text: data.text,
        meta: data.meta,
        seq: data.seq,
        createdAt: new Date('2026-04-11T00:00:00.000Z'),
      }));
    const update = vi.fn().mockResolvedValue({ id: 'session-1', status: 'idle' });
    const session = {
      findUnique: vi.fn().mockResolvedValue({ id: 'session-1', status: 'idle' }),
      update,
    };
    const sessionMessage = {
      aggregate,
      create,
    };
    const db = {
      session,
      sessionMessage,
      $transaction: vi.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return input({ session, sessionMessage });
        }
        return Promise.all(input as Promise<unknown>[]);
      }),
    };
    const store = buildStoreWithMockDb(db);

    const message = await store.appendMessage('session-1', {
      type: 'message',
      title: 'Text Reply',
      text: '조사 중입니다.',
      meta: { role: 'agent' },
    });

    expect(message.meta?.seq).toBe(2);
    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(update).toHaveBeenCalledTimes(1);
  });
});

describe('PrismaRuntimeStore chat-scoped events', () => {
  it('retries when the next chat-local seq collides with an existing event in the same chat', async () => {
    const sessionChat = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'chat-1',
        sessionId: 'session-1',
        latestPreview: '',
      }),
      update: vi.fn().mockResolvedValue({ id: 'chat-1' }),
    };
    const sessionRun = {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    };
    const aggregate = vi.fn()
      .mockResolvedValueOnce({ _max: { seq: 2 } })
      .mockResolvedValueOnce({ _max: { seq: 3 } });
    const create = vi.fn()
      .mockRejectedValueOnce(Object.assign(new Error('duplicate chat seq'), { code: 'P2002' }))
      .mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'event-4',
        sessionId: data.sessionId,
        chatId: data.chatId,
        runId: data.runId,
        type: data.type,
        title: data.title,
        text: data.text,
        meta: data.meta,
        seq: data.seq,
        createdAt: new Date('2026-04-13T00:00:00.000Z'),
      }));
    const sessionChatEvent = {
      aggregate,
      create,
    };
    const db = {
      sessionChat,
      sessionRun,
      sessionChatEvent,
      $transaction: vi.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return input({ sessionChat, sessionRun, sessionChatEvent });
        }
        return Promise.all(input as Promise<unknown>[]);
      }),
    };
    const store = buildStoreWithMockDb(db) as PrismaRuntimeStore & {
      appendChatEvent: (
        chatId: string,
        input: { sessionId: string; type: string; title?: string; text: string; meta?: Record<string, unknown> },
      ) => Promise<{ meta?: Record<string, unknown> }>;
    };

    const event = await store.appendChatEvent('chat-1', {
      sessionId: 'session-1',
      type: 'message',
      title: 'Text Reply',
      text: '완료',
      meta: { role: 'agent' },
    });

    expect(event.meta?.seq).toBe(4);
    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(sessionChat.update).toHaveBeenCalledTimes(1);
    expect(db.$transaction).toHaveBeenCalledWith(
      expect.any(Function),
      expect.objectContaining({
        isolationLevel: expect.anything(),
        maxWait: 10000,
        timeout: 15000,
      }),
    );
  });

  it('retries chat event writes when Prisma surfaces a transaction API timeout', async () => {
    const sessionChat = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'chat-1',
        sessionId: 'session-1',
        latestPreview: '',
      }),
      update: vi.fn().mockResolvedValue({ id: 'chat-1' }),
    };
    const sessionRun = {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    };
    const aggregate = vi.fn()
      .mockResolvedValueOnce({ _max: { seq: 0 } })
      .mockResolvedValueOnce({ _max: { seq: 0 } });
    const create = vi.fn()
      .mockRejectedValueOnce(new Error('Transaction API error: Unable to start a transaction in the given time.'))
      .mockImplementationOnce(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'event-1',
        sessionId: data.sessionId,
        chatId: data.chatId,
        runId: data.runId,
        type: data.type,
        title: data.title,
        text: data.text,
        meta: data.meta,
        seq: data.seq,
        createdAt: new Date('2026-04-13T00:00:00.000Z'),
      }));
    const sessionChatEvent = {
      aggregate,
      create,
    };
    const db = {
      sessionChat,
      sessionRun,
      sessionChatEvent,
      $transaction: vi.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return input({ sessionChat, sessionRun, sessionChatEvent });
        }
        return Promise.all(input as Promise<unknown>[]);
      }),
    };
    const store = buildStoreWithMockDb(db) as PrismaRuntimeStore & {
      appendChatEvent: (
        chatId: string,
        input: { sessionId: string; type: string; title?: string; text: string; meta?: Record<string, unknown> },
      ) => Promise<{ meta?: Record<string, unknown> }>;
    };

    const event = await store.appendChatEvent('chat-1', {
      sessionId: 'session-1',
      type: 'message',
      title: 'Text Reply',
      text: '완료',
      meta: { role: 'agent' },
    });

    expect(event.meta?.seq).toBe(1);
    expect(aggregate).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenCalledTimes(2);
    expect(sessionChat.update).toHaveBeenCalledTimes(1);
  });

  it('appends chat events with chat-local seq and updates the chat snapshot', async () => {
    const sessionChat = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'chat-1',
        sessionId: 'session-1',
        latestPreview: '',
      }),
      update: vi.fn().mockResolvedValue({ id: 'chat-1' }),
    };
    const sessionRun = {
      create: vi.fn().mockResolvedValue({
        id: 'run-1',
      }),
      findFirst: vi.fn().mockResolvedValue(null),
      update: vi.fn(),
    };
    const sessionChatEvent = {
      aggregate: vi.fn().mockResolvedValue({ _max: { seq: 2 } }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'event-3',
        sessionId: data.sessionId,
        chatId: data.chatId,
        runId: data.runId,
        type: data.type,
        title: data.title,
        text: data.text,
        meta: data.meta,
        seq: data.seq,
        createdAt: new Date('2026-04-13T00:00:00.000Z'),
      })),
    };
    const db = {
      sessionChat,
      sessionRun,
      sessionChatEvent,
      $transaction: vi.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return input({ sessionChat, sessionRun, sessionChatEvent });
        }
        return Promise.all(input as Promise<unknown>[]);
      }),
    };
    const store = buildStoreWithMockDb(db) as PrismaRuntimeStore & {
      appendChatEvent: (
        chatId: string,
        input: { sessionId: string; runId?: string; type: string; title?: string; text: string; meta?: Record<string, unknown> },
      ) => Promise<{ meta?: Record<string, unknown> }>;
    };

    const event = await store.appendChatEvent('chat-1', {
        sessionId: 'session-1',
        type: 'message',
        title: 'Text Reply',
        text: '완료',
        meta: { role: 'user' },
      });

    expect(sessionRun.create).toHaveBeenCalledTimes(1);
    expect(sessionChatEvent.aggregate).toHaveBeenCalledWith({
      where: { chatId: 'chat-1' },
      _max: { seq: true },
    });
    expect(sessionChatEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        chatId: 'chat-1',
        sessionId: 'session-1',
        runId: 'run-1',
        seq: 3,
      }),
    }));
    expect(sessionChat.update).toHaveBeenCalledTimes(1);
    expect(event.meta?.seq).toBe(3);
  });

  it('marks the latest running run as completed when an agent event closes the chat turn', async () => {
    const sessionChat = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'chat-1',
        sessionId: 'session-1',
        latestPreview: '',
      }),
      update: vi.fn().mockResolvedValue({ id: 'chat-1' }),
    };
    const sessionRun = {
      create: vi.fn(),
      findFirst: vi.fn().mockResolvedValue({
        id: 'run-9',
        status: 'running',
      }),
      update: vi.fn().mockResolvedValue({
        id: 'run-9',
        status: 'completed',
      }),
    };
    const sessionChatEvent = {
      aggregate: vi.fn().mockResolvedValue({ _max: { seq: 0 } }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'event-1',
        sessionId: data.sessionId,
        chatId: data.chatId,
        runId: data.runId,
        type: data.type,
        title: data.title,
        text: data.text,
        meta: data.meta,
        seq: data.seq,
        createdAt: new Date('2026-04-13T00:00:00.000Z'),
      })),
    };
    const db = {
      sessionChat,
      sessionRun,
      sessionChatEvent,
      $transaction: vi.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return input({ sessionChat, sessionRun, sessionChatEvent });
        }
        return Promise.all(input as Promise<unknown>[]);
      }),
    };
    const store = buildStoreWithMockDb(db) as PrismaRuntimeStore & {
      appendChatEvent: (
        chatId: string,
        input: { sessionId: string; type: string; title?: string; text: string; meta?: Record<string, unknown> },
      ) => Promise<{ meta?: Record<string, unknown> }>;
    };

    const event = await store.appendChatEvent('chat-1', {
      sessionId: 'session-1',
      type: 'message',
      title: 'Text Reply',
      text: '완료',
      meta: { role: 'agent' },
    });

    expect(sessionRun.findFirst).toHaveBeenCalledTimes(1);
    expect(sessionRun.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'run-9' },
      data: expect.objectContaining({
        status: 'completed',
      }),
    }));
    expect(event.meta?.runId).toBe('run-9');
  });

  it('lists chat events using the chat-local sequence cursor', async () => {
    const sessionChatEvent = {
      findMany: vi.fn().mockResolvedValue([
        {
          id: 'event-2',
          sessionId: 'session-1',
          chatId: 'chat-1',
          runId: 'run-1',
          type: 'message',
          title: 'Text Reply',
          text: '다음 응답',
          meta: { role: 'agent' },
          seq: 2,
          createdAt: new Date('2026-04-13T00:00:00.000Z'),
        },
      ]),
    };
    const store = buildStoreWithMockDb({ sessionChatEvent }) as PrismaRuntimeStore & {
      listChatEvents: (
        chatId: string,
        options?: { afterSeq?: number; limit?: number },
      ) => Promise<Array<{ id: string; meta?: Record<string, unknown> }>>;
    };

    const events = await store.listChatEvents('chat-1', { afterSeq: 1, limit: 20 });

    expect(sessionChatEvent.findMany).toHaveBeenCalledWith({
      where: { chatId: 'chat-1', seq: { gt: 1 } },
      orderBy: { seq: 'asc' },
      take: 20,
    });
    expect(events).toEqual([
      expect.objectContaining({
        id: 'event-2',
        meta: expect.objectContaining({ seq: 2, chatId: 'chat-1', runId: 'run-1' }),
      }),
    ]);
  });

  it('treats a chat as running when it has an active run record', async () => {
    const sessionRun = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'run-1',
        status: 'running',
      }),
    };
    const store = buildStoreWithMockDb({
      sessionRun,
      session: {
        findUnique: vi.fn().mockResolvedValue({ status: 'idle' }),
      },
    });

    const isRunning = await store.isSessionRunning('session-1', 'chat-1');

    expect(sessionRun.findFirst).toHaveBeenCalledWith({
      where: { sessionId: 'session-1', chatId: 'chat-1', status: 'running' },
      select: { id: true },
    });
    expect(isRunning).toBe(true);
  });
});
