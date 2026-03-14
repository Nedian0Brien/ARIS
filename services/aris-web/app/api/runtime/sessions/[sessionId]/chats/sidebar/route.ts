import { NextRequest, NextResponse } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSessionChats } from '@/lib/happy/chats';
import { getSessionRuntimeState } from '@/lib/happy/client';

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

    const chatMap = new Map(chats.map((chat) => [chat.id, chat]));
    const runtimeTargetChatIds = targetChatIds.filter((chatId) => chatId === activeChatId);
    const runningByChat = Object.fromEntries(
      await Promise.all(runtimeTargetChatIds.map(async (chatId) => {
        try {
          const runtime = await getSessionRuntimeState(sessionId, { chatId });
          return [chatId, runtime.isRunning] as const;
        } catch {
          return [chatId, false] as const;
        }
      }))
    );

    const snapshots = targetChatIds.map((chatId) => {
      const cached = chatMap.get(chatId);
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
        isRunning: Boolean(runningByChat[chatId]),
      };
    });

    return NextResponse.json({ snapshots });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load chat sidebar snapshots';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
