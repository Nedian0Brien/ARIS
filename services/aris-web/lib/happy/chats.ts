import { prisma } from '@/lib/db/prisma';
import type { AgentFlavor, ProjectChat } from '@/lib/happy/types';

const DEFAULT_CHAT_TITLE = '새 채팅';

function toProjectChat(record: {
  id: string;
  projectId: string;
  agent: string;
  model: string | null;
  geminiMode: string | null;
  modelReasoningEffort: string | null;
  title: string;
  isPinned: boolean;
  isDefault: boolean;
  threadId: string | null;
  parentChatId?: string | null;
  subagentType?: string | null;
  subagentStatus?: string | null;
  latestPreview: string;
  latestEventId: string | null;
  latestEventAt: Date | null;
  latestEventIsUser: boolean;
  latestHasErrorSignal: boolean;
  lastReadAt: Date | null;
  lastReadEventId: string | null;
  lastActivityAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): ProjectChat {
  return {
    id: record.id,
    projectId: record.projectId,
    agent: resolveAgentFlavor(record.agent),
    model: record.model,
    geminiMode: record.geminiMode,
    modelReasoningEffort: normalizeModelReasoningEffort(record.modelReasoningEffort),
    title: record.title,
    isPinned: record.isPinned,
    isDefault: record.isDefault,
    threadId: record.threadId,
    parentChatId: record.parentChatId ?? null,
    subagentType: record.subagentType ?? null,
    subagentStatus: record.subagentStatus ?? null,
    latestPreview: record.latestPreview,
    latestEventId: record.latestEventId,
    latestEventAt: record.latestEventAt ? record.latestEventAt.toISOString() : null,
    latestEventIsUser: record.latestEventIsUser,
    latestHasErrorSignal: record.latestHasErrorSignal,
    lastReadAt: record.lastReadAt ? record.lastReadAt.toISOString() : null,
    lastReadEventId: record.lastReadEventId,
    lastActivityAt: record.lastActivityAt.toISOString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

function resolveAgentFlavor(input: unknown): AgentFlavor {
  if (input === 'claude' || input === 'codex' || input === 'gemini') {
    return input;
  }
  return 'unknown';
}

function normalizeChatModel(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  const canonical = trimmed === 'gpt-5-codex' ? 'gpt-5.3-codex' : trimmed;
  return canonical.slice(0, 120);
}

function normalizeGeminiMode(input: unknown): string | null {
  if (typeof input !== 'string') {
    return null;
  }
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed.slice(0, 120);
}

function normalizeModelReasoningEffort(input: unknown): 'low' | 'medium' | 'high' | 'xhigh' | null {
  if (typeof input !== 'string') {
    return null;
  }
  const normalized = input.trim().toLowerCase();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'xhigh') {
    return normalized;
  }
  return null;
}

function sortChats(chats: ProjectChat[]): ProjectChat[] {
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

export async function listProjectChats(input: {
  projectId: string;
  userId: string;
  ensureDefault?: boolean;
  limit?: number;
}): Promise<ProjectChat[]> {
  if (input.ensureDefault ?? true) {
    const hasAny = await prisma.chat.findFirst({
      where: {
        projectId: input.projectId,
        userId: input.userId,
        // Ignore imported subagent chats so a project that only contains
        // subagent transcripts still gets a real default chat.
        parentChatId: null,
        subagentStatus: null,
      },
      select: { id: true },
    });

    if (!hasAny) {
      await prisma.chat.create({
        data: {
          projectId: input.projectId,
          userId: input.userId,
          title: DEFAULT_CHAT_TITLE,
          isDefault: true,
        },
      });
    }
  }

  const chats = await prisma.chat.findMany({
    where: {
      projectId: input.projectId,
      userId: input.userId,
      // Subagent (Task tool) transcripts are imported but must never appear in
      // the main chat list — they are surfaced only in the subagent sidebar.
      // A subagent chat is marked by a non-null parentChatId and/or subagentStatus.
      parentChatId: null,
      subagentStatus: null,
    },
    orderBy: [
      { isPinned: 'desc' },
      { lastActivityAt: 'desc' },
      { createdAt: 'desc' },
    ],
    ...(Number.isFinite(input.limit) ? { take: Math.max(1, Math.floor(Number(input.limit))) } : {}),
  });

  return sortChats(chats.map(toProjectChat));
}

/**
 * List the subagent (Task tool) transcripts that belong to a given parent chat,
 * for the right-sidebar subagent panel. Ordered most-recent first.
 */
export async function listSubagentChats(input: {
  parentChatId: string;
  userId: string;
}): Promise<ProjectChat[]> {
  const chats = await prisma.chat.findMany({
    where: {
      parentChatId: input.parentChatId,
      userId: input.userId,
    },
    orderBy: [
      { lastActivityAt: 'desc' },
      { createdAt: 'desc' },
    ],
  });
  return chats.map(toProjectChat);
}

export async function createProjectChat(input: {
  projectId: string;
  userId: string;
  agent?: AgentFlavor;
  model?: string | null;
  geminiMode?: string | null;
  modelReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
  title?: string;
}): Promise<ProjectChat> {
  const existing = await prisma.chat.findMany({
    where: {
      projectId: input.projectId,
      userId: input.userId,
    },
    select: { title: true },
  });

  const title = typeof input.title === 'string' && input.title.trim()
    ? normalizeChatTitle(input.title)
    : buildNextChatTitle(existing.map((chat: { title: string }) => chat.title));

  const created = await prisma.chat.create({
    data: {
      projectId: input.projectId,
      userId: input.userId,
      agent: input.agent && input.agent !== 'unknown' ? input.agent : 'codex',
      ...(input.model !== undefined && { model: normalizeChatModel(input.model) }),
      ...(input.geminiMode !== undefined && { geminiMode: normalizeGeminiMode(input.geminiMode) }),
      ...(input.modelReasoningEffort !== undefined && {
        modelReasoningEffort: normalizeModelReasoningEffort(input.modelReasoningEffort),
      }),
      title,
      isDefault: false,
    },
  });

  return toProjectChat(created);
}

export async function updateProjectChat(input: {
  projectId: string;
  userId: string;
  chatId: string;
  agent?: AgentFlavor;
  title?: string;
  isPinned?: boolean;
  threadId?: string | null;
  touchActivity?: boolean;
  model?: string | null;
  geminiMode?: string | null;
  modelReasoningEffort?: 'low' | 'medium' | 'high' | 'xhigh' | null;
  lastReadAt?: string | null;
  lastReadEventId?: string | null;
  latestPreview?: string;
  latestEventId?: string | null;
  latestEventAt?: string | null;
  latestEventIsUser?: boolean;
  latestHasErrorSignal?: boolean;
}): Promise<ProjectChat> {
  const existing = await prisma.chat.findFirst({
    where: {
      id: input.chatId,
      projectId: input.projectId,
      userId: input.userId,
    },
    select: { id: true },
  });

  if (!existing) {
    throw new Error('CHAT_NOT_FOUND');
  }

  const parsedLastReadAt = (() => {
    if (input.lastReadAt === undefined) {
      return undefined;
    }
    if (!input.lastReadAt || !input.lastReadAt.trim()) {
      return null;
    }
    const epoch = Date.parse(input.lastReadAt);
    if (!Number.isFinite(epoch)) {
      return null;
    }
    return new Date(epoch);
  })();
  const parsedLatestEventAt = (() => {
    if (input.latestEventAt === undefined) {
      return undefined;
    }
    if (!input.latestEventAt || !input.latestEventAt.trim()) {
      return null;
    }
    const epoch = Date.parse(input.latestEventAt);
    if (!Number.isFinite(epoch)) {
      return null;
    }
    return new Date(epoch);
  })();

  const shouldUpdate = input.title !== undefined
    || input.agent !== undefined
    || input.isPinned !== undefined
    || input.threadId !== undefined
    || Boolean(input.touchActivity)
    || input.model !== undefined
    || input.geminiMode !== undefined
    || input.modelReasoningEffort !== undefined
    || parsedLastReadAt !== undefined
    || input.lastReadEventId !== undefined
    || input.latestPreview !== undefined
    || input.latestEventId !== undefined
    || parsedLatestEventAt !== undefined
    || input.latestEventIsUser !== undefined
    || input.latestHasErrorSignal !== undefined;

  if (!shouldUpdate) {
    const current = await prisma.chat.findUnique({
      where: { id: existing.id },
    });
    if (!current) {
      throw new Error('CHAT_NOT_FOUND');
    }
    return toProjectChat(current);
  }

  const updated = await prisma.chat.update({
    where: {
      id: existing.id,
    },
    data: {
      ...(input.title !== undefined && { title: normalizeChatTitle(input.title) }),
      ...(input.agent !== undefined && { agent: input.agent !== 'unknown' ? input.agent : 'codex' }),
      ...(input.isPinned !== undefined && { isPinned: input.isPinned }),
      ...(input.threadId !== undefined && { threadId: input.threadId && input.threadId.trim() ? input.threadId.trim() : null }),
      ...(input.touchActivity && { lastActivityAt: new Date() }),
      ...(input.model !== undefined && { model: normalizeChatModel(input.model) }),
      ...(input.geminiMode !== undefined && { geminiMode: normalizeGeminiMode(input.geminiMode) }),
      ...(input.modelReasoningEffort !== undefined && {
        modelReasoningEffort: normalizeModelReasoningEffort(input.modelReasoningEffort),
      }),
      ...(parsedLastReadAt !== undefined && { lastReadAt: parsedLastReadAt }),
      ...(input.lastReadEventId !== undefined && { lastReadEventId: input.lastReadEventId && input.lastReadEventId.trim() ? input.lastReadEventId.trim() : null }),
      ...(input.latestPreview !== undefined && { latestPreview: input.latestPreview.trim().slice(0, 240) }),
      ...(input.latestEventId !== undefined && { latestEventId: input.latestEventId && input.latestEventId.trim() ? input.latestEventId.trim() : null }),
      ...(parsedLatestEventAt !== undefined && { latestEventAt: parsedLatestEventAt }),
      ...(input.latestEventIsUser !== undefined && { latestEventIsUser: Boolean(input.latestEventIsUser) }),
      ...(input.latestHasErrorSignal !== undefined && { latestHasErrorSignal: Boolean(input.latestHasErrorSignal) }),
      ...(!input.touchActivity && parsedLatestEventAt instanceof Date && { lastActivityAt: parsedLatestEventAt }),
    },
  });

  return toProjectChat(updated);
}

export async function deleteProjectChat(input: {
  projectId: string;
  userId: string;
  chatId: string;
}): Promise<{ deleted: boolean; chats: ProjectChat[] }> {
  const existing = await prisma.chat.findFirst({
    where: {
      id: input.chatId,
      projectId: input.projectId,
      userId: input.userId,
    },
  });

  if (!existing) {
    return {
      deleted: false,
      chats: await listProjectChats({ projectId: input.projectId, userId: input.userId, ensureDefault: true }),
    };
  }

  await prisma.chat.delete({
    where: { id: existing.id },
  });

  let chats = await listProjectChats({ projectId: input.projectId, userId: input.userId, ensureDefault: true });

  const hasDefault = chats.some((chat) => chat.isDefault);
  if (!hasDefault && chats.length > 0) {
    const promoted = await prisma.chat.update({
      where: { id: chats[0].id },
      data: { isDefault: true },
    });
    chats = chats.map((chat) => (chat.id === promoted.id ? toProjectChat(promoted) : chat));
    chats = sortChats(chats);
  }

  return { deleted: true, chats };
}
