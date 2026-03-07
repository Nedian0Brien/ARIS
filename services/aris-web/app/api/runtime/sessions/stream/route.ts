import { NextRequest } from 'next/server';
import { requireApiUser } from '@/lib/auth/guard';
import { listSessions } from '@/lib/happy/client';
import { prisma } from '@/lib/db/prisma';
import type { SessionMetadata } from '@prisma/client';

export const dynamic = 'force-dynamic';

const POLL_INTERVAL_MS = 2000;

export async function GET(request: NextRequest) {
  const auth = await requireApiUser(request);
  if ('response' in auth) {
    return auth.response;
  }

  const userId = auth.user.id;
  const encoder = new TextEncoder();
  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (payload: unknown) => {
        if (cancelled) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(payload)}\n\n`));
        } catch {
          // controller already closed
        }
      };

      const fetchAndSend = async () => {
        if (cancelled) return;
        try {
          const sessions = await listSessions();
          const sessionIds = sessions.map((s) => s.id);
          const metadatas = await prisma.sessionMetadata.findMany({
            where: { sessionId: { in: sessionIds }, userId },
          });
          const metadataMap = new Map(metadatas.map((m: SessionMetadata) => [m.sessionId, m]));
          send({
            sessions: sessions.map((s) => {
              const meta = metadataMap.get(s.id);
              return {
                ...s,
                alias: meta?.alias ?? null,
                isPinned: meta?.isPinned ?? false,
                lastReadAt: meta?.lastReadAt?.toISOString() ?? null,
              };
            }),
          });
        } catch {
          // ignore, will retry on next tick
        }
      };

      await fetchAndSend();
      const timer = setInterval(() => {
        void fetchAndSend();
      }, POLL_INTERVAL_MS);

      request.signal.addEventListener('abort', () => {
        cancelled = true;
        clearInterval(timer);
        try {
          controller.close();
        } catch {
          // already closed
        }
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no', // nginx reverse proxy에서 버퍼링 비활성화
    },
  });
}
