import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSessionChats } from '@/lib/happy/chats';
import { getChatSnapshots } from '@/lib/happy/client';
import type { SessionChat } from '@/lib/happy/types';

function parseRequestedChatIds(request: NextRequest): string[] {
  const all = request.nextUrl.searchParams.getAll('chatId')
    .flatMap((value) => value.split(','))
    .map((value) => value.trim())
    .filter(Boolean);
  return [...new Set(all)];
}

function parseActiveChatId(request: NextRequest): string | null {
  const raw = request.nextUrl.searchParams.get('activeChatId');
  if (typeof raw !== 'string') {
    return null;
  }
  const trimmed = raw.trim();
  return trimmed || null;
}

function buildFallbackSnapshot(chatId: string, cached: SessionChat | undefined) {
  return {
    chatId,
    preview: typeof cached?.latestPreview === 'string' ? cached.latestPreview : '',
    hasEvents: Boolean(
      (typeof cached?.latestEventId === 'string' && cached.latestEventId.trim().length > 0)
      || (typeof cached?.latestPreview === 'string' && cached.latestPreview.trim().length > 0)
    ),
    hasErrorSignal: Boolean(cached?.latestHasErrorSignal),
    latestEventId: typeof cached?.latestEventId === 'string' && cached.latestEventId.trim().length > 0
      ? cached.latestEventId.trim()
      : null,
    latestEventAt: cached?.latestEventAt ?? null,
    latestEventIsUser: Boolean(cached?.latestEventIsUser),
    isRunning: false,
  };
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
    const activeChatId = parseActiveChatId(request);
    const allowedIds = new Set(chats.map((chat) => chat.id));
    const requestedIds = parseRequestedChatIds(request);
    const targetChatIds = (requestedIds.length > 0 ? requestedIds : chats.map((chat) => chat.id))
      .filter((chatId) => allowedIds.has(chatId));
    if (targetChatIds.length === 0) {
      return NextResponse.json({ snapshots: [] });
    }

    // Primary: derive snapshots from backend event stream
    const backendSnapshots = await getChatSnapshots(sessionId, targetChatIds);
    if (backendSnapshots && backendSnapshots.length > 0) {
      const snapshotMap = new Map(backendSnapshots.map((s) => [s.chatId, s]));
      const chatMap = new Map(chats.map((chat) => [chat.id, chat]));
      const snapshots = targetChatIds.map((chatId) => {
        const fromBackend = snapshotMap.get(chatId);
        if (fromBackend) {
          return fromBackend;
        }
        return buildFallbackSnapshot(chatId, chatMap.get(chatId));
      });
      return NextResponse.json({ snapshots });
    }

    // Fallback: derive from cached SessionChat fields (rolling deploy safety)
    const chatMap = new Map(chats.map((chat) => [chat.id, chat]));
    const snapshots = targetChatIds.map((chatId) =>
      buildFallbackSnapshot(chatId, chatMap.get(chatId)),
    );

    return NextResponse.json({ snapshots });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load chat sidebar snapshots';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
