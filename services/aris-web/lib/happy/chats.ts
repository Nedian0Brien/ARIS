import { prisma } from '@/lib/db/prisma';
import type { ChatAgent, SessionChat } from '@/lib/happy/types';

const DEFAULT_CHAT_TITLE = '새 채팅';
const DEFAULT_CHAT_AGENT: ChatAgent = 'codex';

export function normalizeChatAgent(input: unknown, fallback: ChatAgent = DEFAULT_CHAT_AGENT): ChatAgent {
  if (input === 'claude' || input === 'codex' || input === 'gemini') {
    return input;
  }
  return fallback;
}

function toSessionChat(record: {
  id: string;
  sessionId: string;
  agent: string;
  title: string;
  isPinned: boolean;
  isDefault: boolean;
  threadId: string | null;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): SessionChat {
  return {
    id: record.id,
    sessionId: record.sessionId,
    agent: normalizeChatAgent(record.agent),
    title: record.title,
    isPinned: record.isPinned,
    isDefault: record.isDefault,
    threadId: record.threadId,
    lastActivityAt: record.lastActivityAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function sortChats(chats: SessionChat[]): SessionChat[] {
  return [...chats].sort((a, b) => {
    if (a.isPinned !== b.isPinned) {
      return a.isPinned ? -1 : 1;
    }
    const activity = Date.parse(b.lastActivityAt) - Date.parse(a.lastActivityAt);
    if (Number.isFinite(activity) && activity !== 0) {
      return activity;
    }
    return Date.parse(b.createdAt) - Date.parse(a.createdAt);
  });
}

export function normalizeChatTitle(input: unknown): string {
  if (typeof input !== 'string') {
    return DEFAULT_CHAT_TITLE;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return DEFAULT_CHAT_TITLE;
  }
  return trimmed.slice(0, 120);
}

function buildNextChatTitle(existingTitles: string[]): string {
  const normalizedBase = DEFAULT_CHAT_TITLE.toLowerCase();
  const used = new Set(existingTitles.map((title) => title.trim().toLowerCase()));
  if (!used.has(normalizedBase)) {
    return DEFAULT_CHAT_TITLE;
  }

  for (let index = 2; index <= 9999; index += 1) {
    const candidate = `${DEFAULT_CHAT_TITLE} ${index}`;
    if (!used.has(candidate.toLowerCase())) {
      return candidate;
    }
  }

  return `${DEFAULT_CHAT_TITLE} ${Date.now()}`;
}

export async function listSessionChats(input: {
  sessionId: string;
  userId: string;
  ensureDefault?: boolean;
  defaultAgent?: ChatAgent;
}): Promise<SessionChat[]> {
  const defaultAgent = normalizeChatAgent(input.defaultAgent, DEFAULT_CHAT_AGENT);
  if (input.ensureDefault ?? true) {
    const hasAny = await prisma.sessionChat.findFirst({
      where: {
        sessionId: input.sessionId,
        userId: input.userId,
      },
      select: { id: true },
    });

    if (!hasAny) {
      await prisma.sessionChat.create({
        data: {
          sessionId: input.sessionId,
          userId: input.userId,
          agent: defaultAgent,
          title: DEFAULT_CHAT_TITLE,
          isDefault: true,
        },
      });
    }
  }

  const chats = await prisma.sessionChat.findMany({
    where: {
      sessionId: input.sessionId,
      userId: input.userId,
    },
  });

  return sortChats(chats.map(toSessionChat));
}

export async function createSessionChat(input: {
  sessionId: string;
  userId: string;
  title?: string;
  agent?: ChatAgent;
}): Promise<SessionChat> {
  const existing = await prisma.sessionChat.findMany({
    where: {
      sessionId: input.sessionId,
      userId: input.userId,
    },
    select: { title: true },
  });

  const title = typeof input.title === 'string' && input.title.trim()
    ? normalizeChatTitle(input.title)
    : buildNextChatTitle(existing.map((chat) => chat.title));
  const agent = normalizeChatAgent(input.agent, DEFAULT_CHAT_AGENT);

  const created = await prisma.sessionChat.create({
    data: {
      sessionId: input.sessionId,
      userId: input.userId,
      agent,
      title,
      isDefault: false,
    },
  });

  return toSessionChat(created);
}

export async function updateSessionChat(input: {
  sessionId: string;
  userId: string;
  chatId: string;
  title?: string;
  agent?: ChatAgent;
  isPinned?: boolean;
  threadId?: string | null;
  touchActivity?: boolean;
}): Promise<SessionChat> {
  const existing = await prisma.sessionChat.findFirst({
    where: {
      id: input.chatId,
      sessionId: input.sessionId,
      userId: input.userId,
    },
    select: { id: true },
  });

  if (!existing) {
    throw new Error('CHAT_NOT_FOUND');
  }

  const shouldUpdate = input.title !== undefined
    || input.agent !== undefined
    || input.isPinned !== undefined
    || input.threadId !== undefined
    || Boolean(input.touchActivity);

  if (!shouldUpdate) {
    const current = await prisma.sessionChat.findUnique({
      where: { id: existing.id },
    });
    if (!current) {
      throw new Error('CHAT_NOT_FOUND');
    }
    return toSessionChat(current);
  }

  const updated = await prisma.sessionChat.update({
    where: {
      id: existing.id,
    },
    data: {
      ...(input.title !== undefined && { title: normalizeChatTitle(input.title) }),
      ...(input.agent !== undefined && { agent: normalizeChatAgent(input.agent, DEFAULT_CHAT_AGENT) }),
      ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
      ...(input.threadId !== undefined && { threadId: input.threadId && input.threadId.trim() ? input.threadId.trim() : null }),
      ...(input.touchActivity && { lastActivityAt: new Date() }),
    },
  });

  return toSessionChat(updated);
}

export async function deleteSessionChat(input: {
  sessionId: string;
  userId: string;
  chatId: string;
}): Promise<{ deleted: boolean; chats: SessionChat[] }> {
  const existing = await prisma.sessionChat.findFirst({
    where: {
      id: input.chatId,
      sessionId: input.sessionId,
      userId: input.userId,
    },
  });

  if (!existing) {
    return {
      deleted: false,
      chats: await listSessionChats({ sessionId: input.sessionId, userId: input.userId, ensureDefault: true }),
    };
  }

  await prisma.sessionChat.delete({
    where: { id: existing.id },
  });

  let chats = await listSessionChats({ sessionId: input.sessionId, userId: input.userId, ensureDefault: true });

  const hasDefault = chats.some((chat) => chat.isDefault);
  if (!hasDefault && chats.length > 0) {
    const promoted = await prisma.sessionChat.update({
      where: { id: chats[0].id },
      data: { isDefault: true },
    });
    chats = chats.map((chat) => (chat.id === promoted.id ? toSessionChat(promoted) : chat));
    chats = sortChats(chats);
  }

  return { deleted: true, chats };
}
