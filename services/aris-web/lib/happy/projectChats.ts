import type { AgentFlavor, ProjectChat, SessionChat } from '@/lib/happy/types';
import {
  createSessionChat,
  deleteSessionChat,
  listSessionChats,
  updateSessionChat,
} from '@/lib/happy/chats';

function toProjectChat(chat: SessionChat): ProjectChat {
  return {
    ...chat,
    projectId: chat.projectId ?? chat.sessionId,
  };
}

export async function listProjectChats(input: {
  projectId: string;
  userId: string;
  ensureDefault?: boolean;
  limit?: number;
}): Promise<ProjectChat[]> {
  const chats = await listSessionChats({
    sessionId: input.projectId,
    userId: input.userId,
    ensureDefault: input.ensureDefault,
    limit: input.limit,
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
  const chat = await createSessionChat({
    sessionId: input.projectId,
    userId: input.userId,
    agent: input.agent,
    model: input.model,
    geminiMode: input.geminiMode,
    modelReasoningEffort: input.modelReasoningEffort,
    title: input.title,
  });
  return toProjectChat(chat);
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
  const chat = await updateSessionChat({
    sessionId: input.projectId,
    userId: input.userId,
    chatId: input.chatId,
    agent: input.agent,
    title: input.title,
    isPinned: input.isPinned,
    threadId: input.threadId,
    touchActivity: input.touchActivity,
    model: input.model,
    geminiMode: input.geminiMode,
    modelReasoningEffort: input.modelReasoningEffort,
    lastReadAt: input.lastReadAt,
    lastReadEventId: input.lastReadEventId,
    latestPreview: input.latestPreview,
    latestEventId: input.latestEventId,
    latestEventAt: input.latestEventAt,
    latestEventIsUser: input.latestEventIsUser,
    latestHasErrorSignal: input.latestHasErrorSignal,
  });
  return toProjectChat(chat);
}

export async function deleteProjectChat(input: {
  projectId: string;
  userId: string;
  chatId: string;
}): Promise<{ deleted: boolean; chats: ProjectChat[] }> {
  const result = await deleteSessionChat({
    sessionId: input.projectId,
    userId: input.userId,
    chatId: input.chatId,
  });
  return {
    deleted: result.deleted,
    chats: result.chats.map(toProjectChat),
  };
}
