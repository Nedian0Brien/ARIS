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
