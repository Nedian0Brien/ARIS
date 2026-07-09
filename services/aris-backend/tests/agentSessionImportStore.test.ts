import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { mkdtemp } from 'node:fs/promises';
import { describe, expect, it, vi } from 'vitest';
import { PrismaRuntimeStore } from '../src/runtime/prismaStore.js';

function buildStoreWithMockDb(db: Record<string, unknown>): PrismaRuntimeStore {
  const store = Object.create(PrismaRuntimeStore.prototype) as PrismaRuntimeStore & {
    db: Record<string, unknown>;
  };
  store.db = db;
  return store;
}

describe('PrismaRuntimeStore imported agent sessions', () => {
  it('resolves imported chats to the latest unbranched project session for the directory', async () => {
    const session = {
      findFirst: vi.fn()
        .mockResolvedValueOnce({ id: 'project-session-1' }),
    };
    const store = buildStoreWithMockDb({ session });

    await expect(store.resolveProjectIdByPath('/home/ubuntu/project/ARIS')).resolves.toBe('project-session-1');
    expect(session.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        path: '/home/ubuntu/project/ARIS',
        branch: null,
      },
      orderBy: { updatedAt: 'desc' },
      select: { id: true },
    }));
  });

  it('does not treat hidden native duplicates as owning chats', async () => {
    const sessionChat = {
      findFirst: vi.fn()
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(null),
    };
    const sessionChatEvent = {
      findFirst: vi.fn().mockResolvedValue({ chatId: 'duplicate-chat-1' }),
    };
    const importedAgentSession = {
      findFirst: vi.fn(),
    };
    const store = buildStoreWithMockDb({ sessionChat, sessionChatEvent, importedAgentSession });

    await expect(store.findOwningChat('provider-session-1')).resolves.toBeNull();

    expect(sessionChat.findFirst).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: {
        threadId: 'provider-session-1',
        parentChatId: null,
        subagentStatus: null,
      },
    }));
    expect(sessionChat.findFirst).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: {
        id: 'duplicate-chat-1',
        parentChatId: null,
        subagentStatus: null,
      },
    }));
    expect(importedAgentSession.findFirst).not.toHaveBeenCalled();
  });

  it('creates a chat with provider thread id and links the import ledger', async () => {
    const importedAgentSession = {
      findUnique: vi.fn().mockResolvedValue({
        id: 'import-1',
        provider: 'codex',
        providerSessionId: 'codex-thread-1',
        chatId: null,
      }),
      update: vi.fn().mockResolvedValue({ id: 'import-1', chatId: 'chat-created' }),
    };
    const sessionChat = {
      create: vi.fn().mockResolvedValue({ id: 'chat-created' }),
    };
    const db = {
      importedAgentSession,
      sessionChat,
      $transaction: vi.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return input({ importedAgentSession, sessionChat });
        }
        return Promise.all(input as Promise<unknown>[]);
      }),
    };
    const store = buildStoreWithMockDb(db);

    await expect(store.ensureImportedAgentChat({
      importId: 'import-1',
      arisProjectId: '/home/ubuntu/project/ARIS',
      userId: 'user-1',
      title: 'Codex 가져온 대화',
    })).resolves.toEqual({ chatId: 'chat-created' });

    expect(sessionChat.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        projectId: '/home/ubuntu/project/ARIS',
        userId: 'user-1',
        agent: 'codex',
        threadId: 'codex-thread-1',
        title: 'Codex 가져온 대화',
      }),
    }));
    expect(importedAgentSession.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'import-1' },
      data: expect.objectContaining({ chatId: 'chat-created', arisProjectId: '/home/ubuntu/project/ARIS' }),
    }));
  });

  it('appends imported events once and preserves source timestamps', async () => {
    const sourceCreatedAt = new Date('2026-07-07T00:00:00.000Z');
    const importedAgentEvent = {
      findMany: vi.fn().mockResolvedValue([{ sourceEventKey: 'import-1:existing' }]),
      create: vi.fn().mockResolvedValue({ id: 'event-ledger-1' }),
    };
    const sessionChatEvent = {
      aggregate: vi.fn().mockResolvedValue({ _max: { seq: 2 } }),
      create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
        id: data.id,
        projectId: data.projectId,
        chatId: data.chatId,
        runId: null,
        type: data.type,
        title: data.title,
        text: data.text,
        meta: data.meta,
        seq: data.seq,
        createdAt: data.createdAt,
      })),
    };
    const sessionChat = {
      update: vi.fn().mockResolvedValue({ id: 'chat-1' }),
    };
    const importedAgentSession = {
      findUnique: vi.fn().mockResolvedValue({ importedEventCount: 1, oldestCursorOffset: 5n, newestCursorOffset: 10n }),
      update: vi.fn().mockResolvedValue({ id: 'import-1' }),
    };
    const db = {
      importedAgentEvent,
      sessionChatEvent,
      sessionChat,
      importedAgentSession,
      $transaction: vi.fn(async (input: unknown) => {
        if (typeof input === 'function') {
          return input({ importedAgentEvent, sessionChatEvent, sessionChat, importedAgentSession });
        }
        return Promise.all(input as Promise<unknown>[]);
      }),
    };
    const store = buildStoreWithMockDb(db);

    const events = await store.appendImportedAgentEvents({
      importId: 'import-1',
      provider: 'codex',
      providerSessionId: 'codex-thread-1',
      projectId: '/home/ubuntu/project/ARIS',
      chatId: 'chat-1',
      hasMoreBefore: false,
      messages: [
        {
          role: 'user',
          text: '이미 있음',
          sourceEventKey: 'import-1:existing',
          sourceOffset: 10n,
          sourceCreatedAt,
        },
        {
          role: 'assistant',
          text: '새 답변',
          sourceEventKey: 'import-1:new',
          sourceOffset: 20n,
          sourceCreatedAt,
        },
      ],
    });

    expect(events).toHaveLength(1);
    expect(events[0]?.createdAt).toBe('2026-07-07T00:00:00.000Z');
    expect(sessionChatEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        seq: 3,
        createdAt: sourceCreatedAt,
        meta: expect.objectContaining({
          imported: true,
          importedProvider: 'codex',
          importedSessionId: 'codex-thread-1',
          sourceEventKey: 'import-1:new',
          sourceOffset: '20',
          sourceCreatedAt: '2026-07-07T00:00:00.000Z',
        }),
      }),
    }));
    expect(importedAgentEvent.create).toHaveBeenCalledTimes(1);
    expect(importedAgentSession.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        hasMoreBefore: false,
        oldestCursorOffset: 5n,
        newestCursorOffset: 20n,
      }),
    }));
    expect(sessionChat.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: 'chat-1' },
      data: expect.objectContaining({
        latestPreview: '새 답변',
        latestEventAt: sourceCreatedAt,
      }),
    }));
  });

  it('loads older imported events from the source file before the stored cursor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aris-import-store-'));
    const sourcePath = join(root, 'codex.jsonl');
    await mkdir(root, { recursive: true });
    const lines = [
      '{"timestamp":"2026-07-07T00:00:00.000Z","type":"session_meta","payload":{"id":"codex-session-1","cwd":"/home/ubuntu/project/ARIS"}}',
      '{"timestamp":"2026-07-07T00:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"첫 번째 요청"}]}}',
      '{"timestamp":"2026-07-07T00:00:02.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"첫 번째 답변"}]}}',
      '{"timestamp":"2026-07-07T00:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"두 번째 요청"}]}}',
      '{"timestamp":"2026-07-07T00:00:04.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"두 번째 답변"}]}}',
    ];
    await writeFile(sourcePath, lines.join('\n'));
    const secondTurnOffset = BigInt(lines[0].length + 1 + lines[1].length + 1 + lines[2].length + 1);
    const importedAgentSession = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'import-1',
        provider: 'codex',
        providerSessionId: 'codex-session-1',
        sourcePath,
        projectPath: '/home/ubuntu/project/ARIS',
        arisProjectId: '/home/ubuntu/project/ARIS',
        chatId: 'chat-1',
        oldestCursorOffset: secondTurnOffset,
      }),
      update: vi.fn().mockResolvedValue({ id: 'import-1' }),
    };
    const db = { importedAgentSession };
    const store = buildStoreWithMockDb(db) as PrismaRuntimeStore & {
      appendImportedAgentEvents: ReturnType<typeof vi.fn>;
    };
    store.appendImportedAgentEvents = vi.fn().mockResolvedValue([{ id: 'event-older' }]);

    const result = await store.loadOlderImportedAgentEvents({ chatId: 'chat-1', limitTurns: 1 });

    expect(result).toEqual({ events: [{ id: 'event-older' }], hasMoreBefore: false });
    expect(store.appendImportedAgentEvents).toHaveBeenCalledWith(expect.objectContaining({
      importId: 'import-1',
      messages: [
        expect.objectContaining({ text: '첫 번째 요청' }),
        expect.objectContaining({ text: '첫 번째 답변' }),
      ],
    }));
  });

  it('syncs latest imported events from the source file after the stored cursor', async () => {
    const root = await mkdtemp(join(tmpdir(), 'aris-import-store-'));
    const sourcePath = join(root, 'codex.jsonl');
    await mkdir(root, { recursive: true });
    const lines = [
      '{"timestamp":"2026-07-07T00:00:00.000Z","type":"session_meta","payload":{"id":"codex-session-1","cwd":"/home/ubuntu/project/ARIS"}}',
      '{"timestamp":"2026-07-07T00:00:01.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"첫 번째 요청"}]}}',
      '{"timestamp":"2026-07-07T00:00:02.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"첫 번째 답변"}]}}',
      '{"timestamp":"2026-07-07T00:00:03.000Z","type":"response_item","payload":{"type":"message","role":"user","content":[{"type":"input_text","text":"새 요청"}]}}',
      '{"timestamp":"2026-07-07T00:00:04.000Z","type":"response_item","payload":{"type":"message","role":"assistant","content":[{"type":"output_text","text":"새 답변"}]}}',
    ];
    await writeFile(sourcePath, lines.join('\n'));
    const firstTurnOffset = BigInt(lines[0].length + 1 + lines[1].length + 1 + lines[2].length + 1) - 1n;
    const importedAgentSession = {
      findFirst: vi.fn().mockResolvedValue({
        id: 'import-1',
        provider: 'codex',
        providerSessionId: 'codex-session-1',
        sourcePath,
        projectPath: '/home/ubuntu/project/ARIS',
        arisProjectId: '/home/ubuntu/project/ARIS',
        chatId: 'chat-1',
        fileSize: BigInt(lines.join('\n').length - 1),
        fileMtimeMs: 0n,
        newestCursorOffset: firstTurnOffset,
        hasMoreBefore: true,
      }),
      update: vi.fn().mockResolvedValue({ id: 'import-1' }),
    };
    const store = buildStoreWithMockDb({ importedAgentSession }) as PrismaRuntimeStore & {
      appendImportedAgentEvents: ReturnType<typeof vi.fn>;
    };
    store.appendImportedAgentEvents = vi.fn().mockResolvedValue([{ id: 'event-new-1' }, { id: 'event-new-2' }]);

    const result = await store.syncLatestImportedAgentEvents({ chatId: 'chat-1', limitEvents: 10 });

    expect(result).toEqual({ events: [{ id: 'event-new-1' }, { id: 'event-new-2' }] });
    expect(store.appendImportedAgentEvents).toHaveBeenCalledWith(expect.objectContaining({
      importId: 'import-1',
      provider: 'codex',
      providerSessionId: 'codex-session-1',
      projectId: '/home/ubuntu/project/ARIS',
      chatId: 'chat-1',
      messages: [
        expect.objectContaining({ text: '새 요청' }),
        expect.objectContaining({ text: '새 답변' }),
      ],
      hasMoreBefore: true,
    }));
  });

  it('lists linked imported sessions that still have older transcript for backfill', async () => {
    const importedAgentSession = {
      findMany: vi.fn().mockResolvedValue([
        { id: 'import-1', chatId: 'chat-1', hasMoreBefore: true },
      ]),
    };
    const store = buildStoreWithMockDb({ importedAgentSession });

    await expect(store.listImportedAgentSessionsForBackfill({
      projectPath: '/home/ubuntu/project/ARIS',
      limit: 5,
    })).resolves.toEqual([{ id: 'import-1', chatId: 'chat-1', hasMoreBefore: true }]);
    expect(importedAgentSession.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        projectPath: '/home/ubuntu/project/ARIS',
        chatId: { not: null },
        hasMoreBefore: true,
      }),
      take: 5,
    }));
  });
});
