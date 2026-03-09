import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSessionChats } from '@/lib/happy/chats';
import { getSessionRuntimeState, listLatestEventsByChat } from '@/lib/happy/client';
import type { UiEvent } from '@/lib/happy/types';

function isUserEvent(event: UiEvent): boolean {
  return event.meta?.role === 'user' || event.title === 'User Instruction';
}

function truncateSingleLine(input: string, max = 96): string {
  const compact = input.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, max).trimEnd()}...`;
}

function resolveActionPrimary(event: UiEvent): string {
  if (event.action?.command) {
    return event.action.command;
  }
  if (event.action?.path) {
    return event.action.path;
  }
  const firstLine = event.body.split('\n')[0]?.trim() ?? '';
  if (!firstLine) {
    return event.title || event.kind;
  }
  return firstLine.startsWith('$ ') ? firstLine.slice(2).trim() : firstLine;
}

function resolveRecentSummary(event: UiEvent): string {
  if (isUserEvent(event)) {
    return truncateSingleLine(event.body || event.title || '사용자 메시지');
  }
  const primary = resolveActionPrimary(event);
  if (primary) {
    return truncateSingleLine(primary);
  }
  return truncateSingleLine(event.title || event.kind);
}

function hasChatErrorSignal(event: UiEvent | null | undefined): boolean {
  if (!event) {
    return false;
  }
  const streamEvent = typeof event.meta?.streamEvent === 'string'
    ? event.meta.streamEvent.toLowerCase()
    : '';
  return (
    streamEvent === 'runtime_disconnected'
    || streamEvent === 'stream_error'
    || streamEvent === 'runtime_error'
  );
}

function parseRequestedChatIds(request: NextRequest): string[] {
  const all = request.nextUrl.searchParams.getAll('chatId')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(all)];
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  try {
    const { sessionId } = await params;
    const chats = await listSessionChats({
      sessionId,
      userId: auth.user.id,
      ensureDefault: true,
    });
    const allowedIds = new Set(chats.map((chat) => chat.id));
    const requestedIds = parseRequestedChatIds(request);
    const targetChatIds = (requestedIds.length > 0 ? requestedIds : chats.map((chat) => chat.id))
      .filter((chatId) => allowedIds.has(chatId));
    if (targetChatIds.length === 0) {
      return NextResponse.json({ snapshots: [] });
    }

    const defaultChatId = chats.find((chat) => chat.isDefault)?.id ?? null;
    const latestEventsByChat = await listLatestEventsByChat({
      sessionId,
      chatIds: targetChatIds,
      defaultChatId,
    });
    const runtimePairs = await Promise.all(targetChatIds.map(async (chatId) => {
      try {
        const runtime = await getSessionRuntimeState(sessionId, { chatId });
        return [chatId, runtime.isRunning] as const;
      } catch {
        return [chatId, false] as const;
      }
    }));
    const runtimeByChat = new Map<string, boolean>(runtimePairs);

    const snapshots = targetChatIds.map((chatId) => {
      const latest = latestEventsByChat[chatId] ?? null;
      return {
        chatId,
        preview: latest ? resolveRecentSummary(latest) : '',
        hasEvents: Boolean(latest),
        hasErrorSignal: hasChatErrorSignal(latest),
        latestEventId: latest?.id ?? null,
        latestEventAt: latest?.timestamp ?? null,
        latestEventIsUser: latest ? isUserEvent(latest) : false,
        isRunning: runtimeByChat.get(chatId) ?? false,
      };
    });

    return NextResponse.json({ snapshots });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load chat sidebar snapshots';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
