import { describe, expect, it, vi } from 'vitest';
import { PrismaRuntimeStore } from '../src/runtime/prismaStore.js';

function buildStoreWithMockDb(db: Record<string, unknown>): PrismaRuntimeStore {
  const store = Object.create(PrismaRuntimeStore.prototype) as PrismaRuntimeStore & {
    db: Record<string, unknown>;
  };
  store.db = db;
  return store;
}

describe('PrismaRuntimeStore runtime coordination', () => {
  it('loads a persisted permission by id', async () => {
    const permission = {
      id: 'perm-1',
      sessionId: 'session-1',
      chatId: 'chat-1',
      agent: 'codex',
      command: 'npm test',
      reason: 'Need approval',
      risk: 'medium',
      state: 'approved',
      requestedAt: new Date('2026-04-14T12:00:00.000Z'),
      decidedAt: new Date('2026-04-14T12:01:00.000Z'),
    };
    const db = {
      permission: {
        findUnique: vi.fn().mockResolvedValue(permission),
      },
    };
    const store = buildStoreWithMockDb(db) as PrismaRuntimeStore & {
      getPermissionById: (permissionId: string) => Promise<{ state: string } | null>;
    };

    await expect(store.getPermissionById('perm-1')).resolves.toMatchObject({
      state: 'approved',
    });
    expect(db.permission.findUnique).toHaveBeenCalledWith({
      where: { id: 'perm-1' },
    });
  });

  it('detects a persisted abort action scoped to a chat', async () => {
    const db = {
      sessionMessage: {
        findFirst: vi.fn().mockResolvedValue({
          id: 'message-1',
          meta: {
            action: 'abort',
            chatId: 'chat-1',
          },
        }),
      },
    };
    const store = buildStoreWithMockDb(db) as PrismaRuntimeStore & {
      hasRequestedAction: (input: {
        sessionId: string;
        action: 'abort' | 'retry' | 'resume' | 'kill';
        chatId?: string;
        createdAfter?: Date;
      }) => Promise<boolean>;
    };
    const startedAt = new Date('2026-04-14T12:00:00.000Z');

    await expect(store.hasRequestedAction({
      sessionId: 'session-1',
      action: 'abort',
      chatId: 'chat-1',
      createdAfter: startedAt,
    })).resolves.toBe(true);

    expect(db.sessionMessage.findFirst).toHaveBeenCalledWith({
      where: expect.objectContaining({
        sessionId: 'session-1',
        createdAt: { gt: startedAt },
      }),
      orderBy: { createdAt: 'desc' },
      select: { id: true, meta: true },
    });
  });
});
